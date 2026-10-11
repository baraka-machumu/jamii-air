import { SecretBox } from './secret-box.js';
import { base32Decode, base32Encode, newTotpSecret, totpAt, totpStep, totpUri, verifyTotp } from './totp.js';

// RFC 6238 appendix B test secret ("12345678901234567890", SHA-1), truncated to 6 digits.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('totp', () => {
  it('matches the RFC 6238 test vectors', () => {
    expect(totpAt(RFC_SECRET, totpStep(59_000))).toBe('287082');
    expect(totpAt(RFC_SECRET, totpStep(1_111_111_109_000))).toBe('081804');
    expect(totpAt(RFC_SECRET, totpStep(1_234_567_890_000))).toBe('005924');
    expect(totpAt(RFC_SECRET, totpStep(2_000_000_000_000))).toBe('279037');
  });

  it('accepts the current step and one step of drift, nothing else', () => {
    const secret = newTotpSecret();
    const now = 1_800_000_000_000;
    const step = totpStep(now);
    expect(verifyTotp(secret, totpAt(secret, step), now)).toBe(step);
    expect(verifyTotp(secret, totpAt(secret, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, step + 1), now)).toBe(step + 1);
    expect(verifyTotp(secret, totpAt(secret, step - 2), now)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now)).toBeNull();
    expect(verifyTotp(secret, '12345', now)).toBeNull();
  });

  it('round-trips base32 and builds an otpauth URI', () => {
    const bytes = Buffer.from('any bytes at all!');
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    expect(newTotpSecret()).toMatch(/^[A-Z2-7]{32}$/);
    expect(totpUri('ABC', 'neema@jamii.test')).toBe(
      'otpauth://totp/Jamii%20Air%20Admin%3Aneema%40jamii.test?secret=ABC&issuer=Jamii+Air+Admin&algorithm=SHA1&digits=6&period=30');
  });
});

describe('SecretBox', () => {
  it('seals and opens; tampering or another key fails', () => {
    const box = new SecretBox('k'.repeat(32));
    const sealed = box.seal('JBSWY3DPEHPK3PXP');
    expect(sealed.toString('utf8')).not.toContain('JBSWY3DPEHPK3PXP');
    expect(box.open(sealed)).toBe('JBSWY3DPEHPK3PXP');
    expect(box.seal('x').equals(box.seal('x'))).toBe(false); // fresh IV each time

    const tampered = Buffer.from(sealed);
    tampered[tampered.length - 1] ^= 1;
    expect(() => box.open(tampered)).toThrow();
    expect(() => new SecretBox('other'.repeat(8)).open(sealed)).toThrow();
  });
});
