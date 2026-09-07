import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { StorageProvider } from './storage-provider.interface';

/**
 * S3-compatible object storage - works against real AWS S3, and (via
 * S3_ENDPOINT) Cloudflare R2, DigitalOcean Spaces, MinIO, Backblaze B2, or
 * anything else speaking the S3 API. Selected via STORAGE_PROVIDER=s3 (see
 * ProductsModule) - the local-disk default stays LocalDiskStorageProvider so
 * `docker compose up` needs zero storage config to work.
 *
 * Uploads as a public object with no signed-URL layer, deliberately matching
 * LocalDiskStorageProvider's existing behavior and this project's documented
 * design decision that product images are non-sensitive public assets (see
 * docs/ARCHITECTURE.md §10) - this provider doesn't change that decision,
 * just where the bytes live. If per-tenant private access is ever needed,
 * @aws-sdk/s3-request-presigner's getSignedUrl is the natural next layer on
 * top of this, generating a private GetObjectCommand URL instead of the
 * public one built here - it isn't included, since it would need a new
 * expiring-URL story on the frontend that's a genuinely separate feature,
 * not a config flip.
 *
 * Verified in this sandbox: PutObjectCommand actually executed and
 * succeeded against a real, locally-run S3rver instance (a real S3-API-
 * compatible HTTP server used for exactly this kind of test, not a mock or
 * a stub) - see s3-storage.provider.spec.ts, which also reads the object
 * back with a second, independent GetObjectCommand to confirm what was
 * stored matches what was sent. That confirms the request signing, the SDK
 * wiring, and the upload path all genuinely work against a real S3 API, not
 * just that the code compiles. That same test caught a real bug in this
 * file's first draft: the key sanitizer stripped "/" entirely, which would
 * have silently flattened any future hierarchical key (e.g.
 * `stores/<id>/products/<id>.jpg`) into one unreadable filename - fixed to
 * keep interior "/" while still dropping a leading one and anything else
 * unsafe. NOT verified: an actual AWS S3 (or R2/Spaces) bucket, which needs
 * real account credentials this sandbox doesn't have. Point S3_* at your
 * real bucket and upload a product image before relying on this in
 * production - bucket policy (public-read access, since this provider sets
 * no per-object ACL - see below) is exactly the kind of per-provider setup
 * step that only shows up against the real thing.
 */
@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrlBase: string;

  constructor(config: ConfigService) {
    const bucket = config.get<string>('S3_BUCKET');
    const region = config.get<string>('S3_REGION');
    if (!bucket || !region) {
      throw new Error(
        'S3_BUCKET and S3_REGION are required when STORAGE_PROVIDER=s3',
      );
    }
    this.bucket = bucket;

    // Unset for real AWS S3. Set for R2/Spaces/MinIO/etc, which all speak
    // the S3 API but aren't *at* an amazonaws.com endpoint.
    const endpoint = config.get<string>('S3_ENDPOINT');
    const accessKeyId = config.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('S3_SECRET_ACCESS_KEY');

    this.client = new S3Client({
      region,
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      // Omitting `credentials` entirely (rather than passing undefined
      // fields) lets the SDK fall back to its default provider chain - an
      // IAM role in real AWS deployments, which is the recommended way to
      // avoid long-lived keys entirely. Only pass explicit credentials when
      // both are actually set (R2/Spaces/MinIO don't have an IAM-role
      // concept, so they need this).
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });

    this.publicUrlBase =
      config.get<string>('S3_PUBLIC_URL_BASE') ??
      (endpoint
        ? `${endpoint}/${bucket}`
        : `https://${bucket}.s3.${region}.amazonaws.com`);
  }

  async upload(file: Buffer, key: string): Promise<{ url: string }> {
    // Defense in depth, matching LocalDiskStorageProvider's path.basename -
    // though unlike a real filesystem, S3 has no actual directory traversal
    // to defend against (a key is just an opaque string; "../" in one isn't
    // resolved specially). `/` is kept deliberately - it's how S3 keys
    // express prefixes (e.g. `stores/<id>/products/<id>.jpg`) - this only
    // strips characters that could break URL construction or confuse
    // tooling, plus a leading `/` that would otherwise double up with the
    // `/` already joining publicUrlBase to the key below.
    const safeKey = key.replace(/[^a-zA-Z0-9._/-]/g, '').replace(/^\/+/, '');

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: safeKey,
        Body: file,
        // No per-object ACL set here deliberately - AWS disabled ACLs by
        // default on new buckets since April 2023, and setting one now
        // throws AccessControlListNotSupported on any bucket using that
        // default. Public read access belongs on the bucket policy, once,
        // not on every PutObjectCommand.
      }),
    );

    return { url: `${this.publicUrlBase}/${safeKey}` };
  }
}
