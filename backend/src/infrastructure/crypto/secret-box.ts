// Encryption at rest for admin TOTP secrets (Schema: admin_users.totp_secret_enc, "AES-256-GCM
// ciphertext; key outside the DB"). Layout: version (1 byte) | IV (12) | auth tag (16) | ciphertext.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const VERSION = 1;

export class SecretBox {
  private readonly key: Buffer;

  /** `secret`: ADMIN_TOTP_KEY, a random string of at least 32 characters; the AES key is its SHA-256. */
  constructor(secret: string) {
    this.key = createHash('sha256').update(secret, 'utf8').digest();
  }

  seal(plaintext: string): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), body]);
  }

  /** Throws if the data was changed or sealed with another key. */
  open(sealed: Buffer): string {
    if (sealed.length < 29 || sealed[0] !== VERSION) throw new Error('unsupported sealed secret');
    const decipher = createDecipheriv('aes-256-gcm', this.key, sealed.subarray(1, 13));
    decipher.setAuthTag(sealed.subarray(13, 29));
    return Buffer.concat([decipher.update(sealed.subarray(29)), decipher.final()]).toString('utf8');
  }
}
