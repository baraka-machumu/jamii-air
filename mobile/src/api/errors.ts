// Errors the app shows (TRD API-05, App Flow §13). The API's `error.code` is stable and translated
// here; `message` is English for developers and never shown to users.
import type { TFunction } from 'i18next';
import type { components } from './schema';

/** Every code the API can return (published in the OpenAPI spec). */
export type ServerErrorCode = components['schemas']['ApiErrorDetail']['code'];
/** Failures that never reached the API. */
export type ClientErrorCode = 'NETWORK_ERROR' | 'TIMEOUT';
export type ErrorCode = ServerErrorCode | ClientErrorCode;

export class ApiError extends Error {
  constructor(
    /** HTTP status; 0 when the request never got an answer. */
    readonly status: number,
    readonly code: ErrorCode | string,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** From the error envelope `{ error: { code, message, details }, requestId }`. */
  static fromResponse(status: number, body: unknown): ApiError {
    const envelope = body as { error?: { code?: string; message?: string; details?: Record<string, unknown> }; requestId?: string } | undefined;
    const error = envelope?.error;
    return new ApiError(status, error?.code ?? `HTTP_${status}`, error?.message ?? `HTTP ${status}`, error?.details, envelope?.requestId);
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }
}

/**
 * The message to show for an error, in the app's language. Known codes have their own text;
 * anything else falls back by kind (offline, server trouble, or a generic message).
 */
export function errorMessage(error: unknown, t: TFunction): string {
  if (!(error instanceof ApiError)) return t('errors.UNKNOWN');
  const fallback = error.isNetwork ? t('errors.NETWORK_ERROR') : error.status >= 500 ? t('errors.INTERNAL_ERROR') : t('errors.UNKNOWN');
  return t(`errors.${error.code}`, { defaultValue: fallback });
}
