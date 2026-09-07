import { parseDurationToMs } from './cookie.util';
import { hashResetToken } from './auth.service';

describe('parseDurationToMs', () => {
  it('parses seconds', () => {
    expect(parseDurationToMs('30s')).toBe(30 * 1000);
  });

  it('parses minutes', () => {
    expect(parseDurationToMs('15m')).toBe(15 * 60 * 1000);
  });

  it('parses hours', () => {
    expect(parseDurationToMs('2h')).toBe(2 * 60 * 60 * 1000);
  });

  it('parses days', () => {
    expect(parseDurationToMs('7d')).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('throws on an unrecognized format', () => {
    expect(() => parseDurationToMs('nonsense')).toThrow();
    expect(() => parseDurationToMs('15x')).toThrow();
    expect(() => parseDurationToMs('')).toThrow();
  });
});

describe('hashResetToken', () => {
  it('is deterministic - the same input always produces the same hash', () => {
    const token = 'a'.repeat(64);
    expect(hashResetToken(token)).toBe(hashResetToken(token));
  });

  it('produces different hashes for different inputs', () => {
    expect(hashResetToken('token-a')).not.toBe(hashResetToken('token-b'));
  });

  it('produces a 64-character lowercase hex string (SHA-256)', () => {
    const hash = hashResetToken('some-random-token');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
