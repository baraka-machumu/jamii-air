// API error contract (TRD API-05, §6.4): every error response is
//   { "error": { "code": "POST_NOT_FOUND", "message": "…", "details": {…} }, "requestId": "…" }
// `code` is stable and is what the apps translate; `message` is English, for developers.

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message ?? defaultMessage(code));
    this.name = 'ApiError';
  }
}

export interface ErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> };
  requestId: string;
}

/** Developer-facing default messages for the codes the stored procedures raise (Schema §6.1). */
const MESSAGES: Record<string, string> = {
  INTERNAL_ERROR: 'Something went wrong. Please try again.',
  VALIDATION_FAILED: 'The request is not valid.',
  NOT_FOUND: 'Not found.',
  UNAUTHORIZED: 'Authentication is required.',
  FORBIDDEN: 'You are not allowed to do this.',
  RATE_LIMITED: 'Too many requests. Please try again later.',
  INVALID_CURSOR: 'The cursor is not valid.',
  INVITE_INVALID: 'The invite code is not valid.',
  UNDER_MINIMUM_AGE: 'You must be 18 or older to use Jamii Air.',
  USERNAME_TAKEN: 'This username is taken.',
  EMAIL_TAKEN: 'This email is already registered.',
  ACCOUNT_SUSPENDED: 'This account is suspended.',
  ACCOUNT_NOT_ACTIVE: 'This account is not active.',
  USER_NOT_FOUND: 'User not found.',
  POST_NOT_FOUND: 'Post not found.',
  COMMENT_NOT_FOUND: 'Comment not found.',
  MEDIA_NOT_FOUND: 'Media not found.',
  MEDIA_NOT_ATTACHABLE: 'This media cannot be used here.',
  CAPTION_TOO_LONG: 'The caption is too long.',
  NOT_OWNER: 'Only the owner can do this.',
  BLOCKED: 'You have blocked this user.',
  IDEMPOTENCY_KEY_REUSED: 'This Idempotency-Key was used for a different request.',
  ADMIN_FORBIDDEN: 'You do not have access to this.',
  ADMIN_LOCKED: 'This admin account is locked or disabled.',
  INVALID_TOTP: 'The code is not correct.',
  CHALLENGE_EXPIRED: 'Please sign in again.',
  SESSION_EXPIRED: 'Your session expired. Please sign in again.',
  CSRF_CHECK_FAILED: 'Missing X-Admin-Client header.',
  NOTE_REQUIRED: 'A reason note (at least 3 characters) is required.',
  REPORT_ALREADY_HANDLED: 'This report was already handled.',
  INVALID_STATE: 'This cannot be done in the current state.',
  INVALID_PASSWORD: 'The password is not correct.',
  CANNOT_BLOCK_SELF: 'You cannot block yourself.',
  CANNOT_REPORT_SELF: 'You cannot report yourself or your own content.',
  INVALID_IDEMPOTENCY_KEY: 'Idempotency-Key must be 8–64 characters: letters, digits, _ . : or -.',
};

export function defaultMessage(code: string): string {
  return MESSAGES[code] ?? code.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) + '.';
}
