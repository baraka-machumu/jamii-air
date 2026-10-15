// The API's error envelope (TRD API-05): { error: { code, message, details }, requestId }. The
// portal shows text of its own per code and never the server's `message`, exactly as the app does.
// English only (Design Brief §13).
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  /** Build from a failed response body; an unparseable body still yields a usable error. */
  static from(status: number, body: unknown, requestId?: string): ApiError {
    const envelope = body as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | null;
    const code = envelope?.error?.code ?? (status === 0 ? 'NETWORK_ERROR' : 'UNKNOWN');
    return new ApiError(status, code, envelope?.error?.message ?? code, envelope?.error?.details, requestId);
  }
}

/** What a moderator reads. Codes with no entry fall back to `unknown`. */
const MESSAGES: Record<string, string> = {
  ADMIN_INVALID_CREDENTIALS: 'Incorrect email or password.',
  ADMIN_LOCKED: 'This account is locked after too many failed attempts. A super-admin can unlock it.',
  ADMIN_TOTP_INVALID: 'That code is not right. Check your authenticator and try again.',
  ADMIN_TOTP_REQUIRED: 'Enter the 6-digit code from your authenticator.',
  ADMIN_FORBIDDEN: 'Your role does not allow this action.',
  ADMIN_NOT_FOUND: 'That admin no longer exists.',
  ADMIN_SESSION_EXPIRED: 'Your session expired. Please sign in again.',
  VALIDATION_FAILED: 'Some details need fixing.',
  RATE_LIMITED: 'Too many attempts. Wait a moment and try again.',
  NETWORK_ERROR: "Couldn't reach the server. Check your connection.",
  TIMEOUT: 'The server took too long to answer.',
  UNKNOWN: 'Something went wrong. Please try again.',
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return MESSAGES[error.code] ?? MESSAGES.UNKNOWN!;
  return MESSAGES.UNKNOWN!;
}
