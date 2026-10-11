// Opaque tokens and their stored forms (AU-03, SR-05: the database only ever sees hashes).
import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';

/** 256-bit random refresh token, base64url (sent to the device; never stored). */
export function newOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 hex: how refresh tokens are stored. Enough for 256-bit random input. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** HMAC-SHA256 hex with a server secret: for short secrets (6-digit codes) a plain hash would be brute-forceable offline. */
export function hmacHex(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value, 'utf8').digest('hex');
}

/** A random numeric code, e.g. the 6-digit password-reset code. */
export function randomDigits(length: number): string {
  return String(randomInt(0, 10 ** length)).padStart(length, '0');
}
