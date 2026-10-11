import { PasswordHasher } from './password-hasher.js';
import { hmacHex, newOpaqueToken, randomDigits, sha256Hex } from './tokens.js';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('hashes with Argon2id at the OWASP minimum and verifies', async () => {
    const hash = await hasher.hash('correct horse battery');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    expect(await hasher.verify(hash, 'correct horse battery')).toBe(true);
    expect(await hasher.verify(hash, 'wrong')).toBe(false);
  });

  it('returns false (after doing the work) for a missing or malformed hash', async () => {
    expect(await hasher.verify(null, 'anything')).toBe(false);
    expect(await hasher.verify('not-a-hash', 'anything')).toBe(false);
  });
});

describe('tokens', () => {
  it('makes 256-bit url-safe tokens and stores them as 64-hex digests', () => {
    const token = newOpaqueToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sha256Hex(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(newOpaqueToken()).not.toBe(token);
  });

  it('keys code hashes with a secret', () => {
    expect(hmacHex('s1', 'a@b.c:123456')).toMatch(/^[0-9a-f]{64}$/);
    expect(hmacHex('s1', 'x')).not.toBe(hmacHex('s2', 'x'));
  });

  it('makes zero-padded numeric codes', () => {
    for (let i = 0; i < 50; i++) expect(randomDigits(6)).toMatch(/^\d{6}$/);
  });
});
