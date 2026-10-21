// SE-07 at any depth. pino's `redact` paths match a key at one fixed depth only (`*.email` is
// `x.email`, never a top-level `email` or `x.y.email`), and nothing in them looks inside strings —
// yet an unexpected database or mail error can carry an address in its message ("Key (email)=(…)
// already exists", "550 <…>: Recipient address rejected"), and the error filter logs the whole
// error. So every log line goes through `scrubLogLine` before it is written (Plan 5.4):
//   - a value under a secret key is replaced, wherever the key is;
//   - in every string, email addresses, Expo push tokens and JWTs are replaced.
// `redact` stays as well, for the request headers it already names.
import { stdSerializers } from 'pino';

export const REDACTED = '[redacted]';

/**
 * Keys whose value is a secret or personal data wherever they appear. Matched case-insensitively.
 * `code` is not here: errors carry codes worth keeping (`P2002`, `ECONNREFUSED`, SQLSTATE), and the
 * one-level `*.code` redact path still covers a body's reset code.
 */
const SECRET_KEYS = new Set([
  'password', 'newpassword', 'currentpassword', 'token', 'refreshtoken', 'accesstoken', 'idtoken',
  'authorization', 'cookie', 'set-cookie', 'email', 'dateofbirth', 'totp', 'totpsecret', 'secret',
  'pushtoken', 'expopushtoken', 'subject',
]);

const PATTERNS: [RegExp, string][] = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  [/Expo(?:nent)?PushToken\[[^\]]*\]/g, '[push-token]'],
  [/eyJ[\w-]{4,}\.[\w-]{4,}\.[\w-]{4,}/g, '[jwt]'],
];

/** Deep enough for an error with a cause with a cause; deeper is cut, not walked. */
const MAX_DEPTH = 8;

export function scrubString(value: string): string {
  return PATTERNS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

/** Values whose own JSON form is what gets logged: not walked. */
function isOpaque(value: object): boolean {
  return value instanceof Date || ArrayBuffer.isView(value) || value instanceof Map || value instanceof Set;
}

export function scrub(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (value === null || typeof value !== 'object' || isOpaque(value)) return value;
  if (depth >= MAX_DEPTH) return '[too deep]';
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  // An Error becomes a plain object first (type, message, stack, cause, own fields), as pino's own
  // `err` serializer would make it; then it is walked like anything else.
  const source = value instanceof Error ? stdSerializers.err(value) : value;
  if (Array.isArray(source)) return source.map((item) => scrub(item, depth + 1, seen));

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    out[key] = SECRET_KEYS.has(key.toLowerCase()) && item != null ? REDACTED : scrub(item, depth + 1, seen);
  }
  return out;
}

/**
 * pino `formatters.log`: runs on every line's merged object, before serializers and `redact`.
 * pino-http's `req` and `res` are the live Node objects, far too big to walk on every request;
 * their serializers keep only id, method, url (scrubbed there) and status.
 */
export function scrubLogLine(object: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(object)) {
    out[key] = key === 'req' || key === 'res' ? value
      : SECRET_KEYS.has(key.toLowerCase()) && value != null ? REDACTED
        : scrub(value);
  }
  return out;
}
