import { matchesImageSignature } from './image-signature.util';

describe('matchesImageSignature', () => {
  const PNG = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0,
  ]);
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const WEBP = Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.from([0, 0, 0, 0]), // file size (unchecked)
    Buffer.from('WEBP', 'ascii'),
  ]);
  const NOT_AN_IMAGE = Buffer.from('<html><script>evil()</script></html>');

  it('accepts a real PNG signature claiming image/png', () => {
    expect(matchesImageSignature(PNG, 'image/png')).toBe(true);
  });

  it('accepts a real JPEG signature claiming image/jpeg', () => {
    expect(matchesImageSignature(JPEG, 'image/jpeg')).toBe(true);
  });

  it('accepts a real WEBP signature claiming image/webp', () => {
    expect(matchesImageSignature(WEBP, 'image/webp')).toBe(true);
  });

  it('rejects a PNG file claiming to be a JPEG', () => {
    expect(matchesImageSignature(PNG, 'image/jpeg')).toBe(false);
  });

  it('rejects non-image bytes even when the claimed type is allowed - the spoofing case this exists for', () => {
    expect(matchesImageSignature(NOT_AN_IMAGE, 'image/png')).toBe(false);
  });

  it('rejects a buffer shorter than the signature it claims to match', () => {
    expect(matchesImageSignature(Buffer.from([0x89, 0x50]), 'image/png')).toBe(
      false,
    );
  });

  it('rejects an unrecognized claimed type outright rather than defaulting to trust', () => {
    expect(matchesImageSignature(PNG, 'image/gif')).toBe(false);
  });
});
