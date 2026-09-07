/**
 * `imageFileFilter` (image-file-filter.ts) only checks the client-supplied
 * `Content-Type` of the multipart field - trivial to spoof, since it's just
 * a header the client writes, not anything about the actual file bytes. By
 * the time multer's fileFilter callback runs, the body isn't buffered yet,
 * so that check can't look at real content; it can only run once
 * `file.buffer` exists, which is after multer has fully read the upload -
 * i.e. here, called from the controller right before the buffer is handed
 * to a StorageProvider.
 *
 * Checks the actual leading bytes ("magic numbers") against the three
 * formats this app claims to accept, rather than trusting the header.
 */

const SIGNATURES: Record<string, (buf: Buffer) => boolean> = {
  'image/png': (buf) =>
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a,
  'image/jpeg': (buf) =>
    buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  'image/webp': (buf) =>
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP',
};

/**
 * Returns true only if `buffer` actually starts with the magic bytes for
 * `claimedMimeType`. An unrecognized `claimedMimeType` is always invalid
 * here - by the time this runs, `imageFileFilter` has already restricted
 * `claimedMimeType` to one of the three keys above, so this should never
 * happen in practice, but a filter bypass shouldn't fall back to "trust it".
 */
export function matchesImageSignature(
  buffer: Buffer,
  claimedMimeType: string,
): boolean {
  const check = SIGNATURES[claimedMimeType];
  return check ? check(buffer) : false;
}
