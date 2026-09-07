import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import S3rver = require('s3rver'); // eslint-disable-line @typescript-eslint/no-require-imports -- export= module (no esModuleInterop), same as stripe elsewhere in this codebase
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { S3StorageProvider } from './s3-storage.provider';

/**
 * Runs a real S3rver instance locally (an actual S3-API-compatible HTTP
 * server, not a mock of the AWS SDK) and points S3StorageProvider at it via
 * S3_ENDPOINT - the same mechanism used for R2/Spaces/MinIO in a real
 * deployment. This confirms request signing, the SDK wiring, and the
 * PutObjectCommand path all genuinely work against a real S3 API. It cannot
 * test an actual AWS S3/R2/Spaces account (no network access to one from
 * here, and forcePathStyle plus a plain-HTTP local endpoint isn't identical
 * to a real bucket's virtual-hosted HTTPS endpoint) - see the class comment
 * for what still needs checking against the real thing.
 */
describe('S3StorageProvider (real local S3-compatible server)', () => {
  let server: S3rver;
  let port: number;
  let dataDir: string;
  const bucket = 'test-bucket';

  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 's3rver-test-'));
    port = 4569 + Math.floor(Math.random() * 100);
    server = new S3rver({
      port,
      address: '127.0.0.1',
      silent: true,
      directory: dataDir,
      resetOnClose: true,
      configureBuckets: [{ name: bucket, configs: [] }],
    });
    await server.run();
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  function makeProvider(): S3StorageProvider {
    const config = {
      get: (key: string) =>
        ({
          S3_BUCKET: bucket,
          S3_REGION: 'us-east-1',
          S3_ENDPOINT: `http://127.0.0.1:${port}`,
          // s3rver's fixed credentials for signed requests - see its README.
          S3_ACCESS_KEY_ID: 'S3RVER',
          S3_SECRET_ACCESS_KEY: 'S3RVER',
        })[key],
    } as ConfigService;
    return new S3StorageProvider(config);
  }

  it('actually uploads bytes through a real signed PutObjectCommand and they land on the server', async () => {
    const provider = makeProvider();
    const fileContents = Buffer.from('not a real image, just test bytes');

    const { url } = await provider.upload(fileContents, 'products/abc-123.jpg');

    expect(url).toBe(`http://127.0.0.1:${port}/${bucket}/products/abc-123.jpg`);

    // Confirms the object is genuinely retrievable from the server - not
    // just that PutObjectCommand resolved without throwing - via a second,
    // independent, real signed request rather than assuming s3rver's
    // internal on-disk layout.
    const client = new S3Client({
      region: 'us-east-1',
      endpoint: `http://127.0.0.1:${port}`,
      forcePathStyle: true,
      credentials: { accessKeyId: 'S3RVER', secretAccessKey: 'S3RVER' },
    });
    const getResult = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: 'products/abc-123.jpg' }),
    );
    const stored = Buffer.from(await getResult.Body!.transformToByteArray());
    expect(stored.equals(fileContents)).toBe(true);
  });

  it('preserves "/" as a prefix separator - S3 keys use it for organization, unlike a real filesystem path', async () => {
    const provider = makeProvider();

    const { url } = await provider.upload(Buffer.from('x'), 'a/b/c.jpg');

    expect(url).toBe(`http://127.0.0.1:${port}/${bucket}/a/b/c.jpg`);
  });

  it('strips unsafe characters and a leading slash, while still keeping interior "/" separators', async () => {
    const provider = makeProvider();

    const { url } = await provider.upload(
      Buffer.from('x'),
      '/products/nice photo.jpg',
    );

    // Leading "/" is gone (it would otherwise double up with the "/"
    // already joining publicUrlBase to the key); the space is gone; the
    // interior "/" between "products" and the filename survives.
    expect(url).toBe(
      `http://127.0.0.1:${port}/${bucket}/products/nicephoto.jpg`,
    );
  });

  it('throws at construction time when S3_BUCKET/S3_REGION are missing - fail at boot, not on the first upload', () => {
    const config = { get: () => undefined } as unknown as ConfigService;
    expect(() => new S3StorageProvider(config)).toThrow(
      'S3_BUCKET and S3_REGION are required',
    );
  });
});
