// Idempotency-Key for retry-safe POSTs (TRD API-08): POST /posts and POST /posts/:id/comments.
// The procedure stores (user, key, route, request hash); a repeat with the same hash returns the
// original result, the same key with a different request is JA409 IDEMPOTENCY_KEY_REUSED.
import { sha256Hex } from '../../infrastructure/crypto/tokens.js';
import { ApiError } from '../errors/api-error.js';

/** A client-made UUID in practice; stored as varchar(64). */
const KEY_PATTERN = /^[A-Za-z0-9_.:-]{8,64}$/;

export interface IdempotencyArgs {
  key: string | null;
  requestHash: string | null;
}

/** Validates the header and hashes the request it guards; no header → both null. */
export function idempotency(header: string | undefined, request: unknown): IdempotencyArgs {
  if (header === undefined) return { key: null, requestHash: null };
  if (!KEY_PATTERN.test(header)) throw new ApiError(400, 'INVALID_IDEMPOTENCY_KEY');
  return { key: header, requestHash: sha256Hex(JSON.stringify(request)) };
}
