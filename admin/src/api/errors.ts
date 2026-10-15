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
  // Sign-in (App Flow §15.2). The message for wrong credentials is deliberately vague: it must not
  // say whether the email exists.
  INVALID_CREDENTIALS: 'Incorrect email or password.',
  ADMIN_LOCKED: 'This account is locked after too many failed attempts. A super-admin can unlock it.',
  INVALID_TOTP: 'That code is not right. Check your authenticator and try again.',
  CHALLENGE_EXPIRED: 'That took too long. Please sign in again.',
  SESSION_EXPIRED: 'Your session expired. Please sign in again.',
  SESSION_INVALID: 'Your session is no longer valid. Please sign in again.',
  UNAUTHORIZED: 'Please sign in again.',
  CSRF_CHECK_FAILED: 'The portal could not prove this request came from it. Reload the page.',
  // Permissions and lookups
  ADMIN_FORBIDDEN: 'Your role does not allow this action.',
  ADMIN_NOT_FOUND: 'That admin no longer exists.',
  FORBIDDEN: 'You are not allowed to do that.',
  NOT_FOUND: 'That is no longer there.',
  // Input
  VALIDATION_FAILED: 'Some details need fixing.',
  NOTE_REQUIRED: 'A reason note is required.',
  PASSWORD_TOO_SHORT: 'Use at least 12 characters.',
  PASSWORD_TOO_COMMON: 'That password is too easy to guess. Choose another.',
  INVALID_PASSWORD: 'That password is not right.',
  // Everything else
  RATE_LIMITED: 'Too many attempts. Wait a moment and try again.',
  SERVICE_UNAVAILABLE: 'The server is busy. Try again in a moment.',
  INTERNAL_ERROR: 'Something went wrong on the server. Try again.',
  NETWORK_ERROR: "Couldn't reach the server. Check your connection.",
  TIMEOUT: 'The server took too long to answer.',
  UNKNOWN: 'Something went wrong. Please try again.',
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return MESSAGES[error.code] ?? MESSAGES.UNKNOWN!;
  return MESSAGES.UNKNOWN!;
}
