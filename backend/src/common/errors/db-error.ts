// Stored-procedure errors → API errors (TRD §6.4, SR-07).
// Procedures raise SQLSTATE `JA<http status>` with the API error code as the message. Prisma
// (driver adapter `pg`) wraps it as P2010 with the original SQLSTATE in
// meta.driverAdapterError.cause.originalCode. Any other database error is not a business error:
// it becomes 500 INTERNAL_ERROR and is logged, never returned.
import { ApiError } from './api-error.js';

interface DriverCause {
  originalCode?: string;
  originalMessage?: string;
}

/** The PostgreSQL SQLSTATE and message behind a Prisma or pg error, if there is one. */
export function databaseErrorOf(error: unknown): { sqlState: string; message: string } | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const e = error as { meta?: { driverAdapterError?: { cause?: DriverCause } }; code?: unknown; message?: unknown };

  const cause = e.meta?.driverAdapterError?.cause;
  if (cause?.originalCode) return { sqlState: cause.originalCode, message: cause.originalMessage ?? '' };

  // A pg DatabaseError (e.g. from a plain pg client): 5-character SQLSTATE in `code`.
  if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code) && typeof e.message === 'string') {
    return { sqlState: e.code, message: e.message };
  }
  return undefined;
}

/** ApiError for a `JA<status>` business error; undefined for anything else. */
export function businessErrorOf(error: unknown): ApiError | undefined {
  const db = databaseErrorOf(error);
  const match = db && /^JA([1-5]\d\d)$/.exec(db.sqlState);
  if (!match) return undefined;
  return new ApiError(Number(match[1]), db.message);
}
