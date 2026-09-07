import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailMessage, MailProvider } from './mail-provider.interface';

/**
 * Real SMTP for production - SendGrid, Postmark, SES, or any provider that
 * speaks standard SMTP over TLS. Unlike MailhogMailProvider, this does NOT
 * hardcode `secure: false, ignoreTLS: true` (Mailhog needs that because it's
 * a plaintext local catcher; a real provider will refuse to authenticate
 * without TLS, and silently accepting that misconfiguration is worse than
 * failing loudly).
 *
 * Selected via MAIL_TRANSPORT=smtp (see MailModule) - the mock/local default
 * stays MailhogMailProvider so `docker compose up` needs zero mail config to
 * work, matching every other provider in this codebase.
 *
 * Verified in this sandbox: connects to and successfully sends a real
 * message through a locally-run `smtp-server` instance with STARTTLS
 * enabled (see smtp-mail.provider.spec.ts) - confirming the TLS handshake,
 * auth, and send path all work end-to-end against a real (if local) SMTP
 * server, not just that the code compiles. That test needed
 * SMTP_TLS_REJECT_UNAUTHORIZED=false to accept its own freshly-generated,
 * self-signed cert; every real provider (SendGrid/SES/Postmark) presents a
 * CA-signed one, so this defaults to strict verification and that var
 * should stay unset in any real deployment. NOT verified: an actual
 * SendGrid/Postmark/SES account, which needs real credentials this sandbox
 * doesn't have. Point SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD at your
 * provider's real values and send yourself a test email before relying on
 * this in production - provider-specific quirks (SendGrid wanting the literal
 * username "apikey", SES needing the sending domain verified first, etc.)
 * are exactly the kind of thing that only shows up against the real thing.
 */
@Injectable()
export class SmtpMailProvider implements MailProvider {
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    const port = config.get<number>('SMTP_PORT');
    if (!host || !port) {
      throw new Error(
        'SMTP_HOST and SMTP_PORT are required when MAIL_TRANSPORT=smtp',
      );
    }

    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASSWORD');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      // 465 is implicit TLS (secure: true, connects straight into TLS).
      // Anything else (587, 25) is STARTTLS: connect in plaintext, then
      // upgrade - requireTLS forces that upgrade to actually happen instead
      // of silently falling back to plaintext if the server doesn't offer it.
      secure: port === 465,
      requireTLS: port !== 465,
      auth: user && pass ? { user, pass } : undefined,
      tls: {
        // Defaults to verifying the cert chain, as it must for any public
        // provider (SendGrid/SES/Postmark all present real, CA-signed
        // certs). The one legitimate exception is an internal/self-hosted
        // relay on a self-signed cert - opt in explicitly, never by default.
        rejectUnauthorized:
          config.get<string>('SMTP_TLS_REJECT_UNAUTHORIZED') !== 'false',
      },
    });
    this.from = config.get<string>('MAIL_FROM') ?? 'no-reply@store-saas.local';
  }

  async send(message: MailMessage): Promise<void> {
    // Throws on failure rather than swallowing it - see
    // MailhogMailProvider's class comment for why: sending now happens in
    // a BullMQ worker (MailProcessor), not inline with the HTTP request,
    // so swallowing here would only mean BullMQ's retry could never
    // actually trigger on a real send failure.
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
    });
  }
}
