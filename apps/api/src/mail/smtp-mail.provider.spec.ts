import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SMTPServer } from 'smtp-server';
import { ConfigService } from '@nestjs/config';
import { SmtpMailProvider } from './smtp-mail.provider';

/**
 * Runs a real smtp-server instance locally (STARTTLS, self-signed cert
 * generated fresh per test run) and points SmtpMailProvider at it - this is
 * an actual SMTP protocol conversation (STARTTLS negotiation, AUTH LOGIN,
 * MAIL FROM/RCPT TO/DATA), not a mocked transporter. It cannot test an
 * actual SendGrid/SES/Postmark account (no network access to one from
 * here), but it does confirm the provider's TLS/auth/send wiring is
 * correct, which a unit test mocking nodemailer entirely would not.
 */
describe('SmtpMailProvider (real local SMTP server)', () => {
  let server: SMTPServer;
  let port: number;
  let received: {
    from: string;
    to: string[];
    subject: string;
    html: string;
  } | null;
  let certDir: string;

  beforeAll(async () => {
    certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smtp-test-cert-'));
    execSync(
      `openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 1 -nodes -subj "/CN=localhost"`,
      { cwd: certDir, stdio: 'pipe' },
    );

    received = null;
    server = new SMTPServer({
      key: fs.readFileSync(path.join(certDir, 'key.pem')),
      cert: fs.readFileSync(path.join(certDir, 'cert.pem')),
      authOptional: false,
      onAuth(auth, _session, callback) {
        if (auth.username === 'testuser' && auth.password === 'testpass') {
          callback(null, { user: 'testuser' });
        } else {
          callback(new Error('Invalid credentials'));
        }
      },
      onData(stream, session, callback) {
        let raw = '';
        stream.on('data', (chunk) => (raw += chunk));
        stream.on('end', () => {
          const subjectMatch = raw.match(/^Subject: (.*)$/m);
          const htmlStart = raw.indexOf('\r\n\r\n');
          received = {
            from: session.envelope.mailFrom
              ? (session.envelope.mailFrom as { address: string }).address
              : '',
            to: session.envelope.rcptTo.map((r) => r.address),
            subject: subjectMatch ? subjectMatch[1] : '',
            html: htmlStart >= 0 ? raw.slice(htmlStart + 4).trim() : '',
          };
          callback();
        });
      },
      // Test cert is self-signed and CN=localhost only - fine for this.
      hideSTARTTLS: false,
    });

    port = 2600 + Math.floor(Math.random() * 100);
    await new Promise<void>((resolve, reject) => {
      server.listen(port, '127.0.0.1', resolve);
      server.on('error', reject);
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(certDir, { recursive: true, force: true });
  });

  function makeProvider(): SmtpMailProvider {
    const config = {
      get: (key: string) =>
        ({
          SMTP_HOST: '127.0.0.1',
          SMTP_PORT: port,
          SMTP_USER: 'testuser',
          SMTP_PASSWORD: 'testpass',
          MAIL_FROM: 'no-reply@store-saas.local',
          // Test server uses a freshly-generated self-signed cert - a real
          // deployment must never set this, see the constructor's comment.
          SMTP_TLS_REJECT_UNAUTHORIZED: 'false',
        })[key],
    } as ConfigService;
    return new SmtpMailProvider(config);
  }

  it('actually delivers a message through STARTTLS + AUTH to the real server', async () => {
    const provider = makeProvider();

    await provider.send({
      to: 'someone@example.com',
      subject: 'Password reset',
      html: '<p>Click the link</p>',
    });

    expect(received).not.toBeNull();
    expect(received!.to).toEqual(['someone@example.com']);
    expect(received!.subject).toBe('Password reset');
    expect(received!.from).toBe('no-reply@store-saas.local');
    expect(received!.html).toContain('Click the link');
  });

  it('throws when the server rejects auth - this is what lets a BullMQ worker actually retry a real failure, see MailProcessor', async () => {
    const config = {
      get: (key: string) =>
        ({
          SMTP_HOST: '127.0.0.1',
          SMTP_PORT: port,
          SMTP_USER: 'testuser',
          SMTP_PASSWORD: 'wrong-password',
          MAIL_FROM: 'no-reply@store-saas.local',
          SMTP_TLS_REJECT_UNAUTHORIZED: 'false',
        })[key],
    } as ConfigService;
    const provider = new SmtpMailProvider(config);

    await expect(
      provider.send({ to: 'x@example.com', subject: 'x', html: 'x' }),
    ).rejects.toThrow();
  });

  it('throws synchronously (constructor time) when SMTP_HOST/SMTP_PORT are missing - fail at boot, not on the first password-reset request', () => {
    const config = { get: () => undefined } as unknown as ConfigService;
    expect(() => new SmtpMailProvider(config)).toThrow(
      'SMTP_HOST and SMTP_PORT are required',
    );
  });
});
