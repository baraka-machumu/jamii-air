// Every `error.code` the API can return (TRD API-05). Published in the OpenAPI spec as the enum of
// ApiErrorBody, so the apps can translate each one (mobile: src/i18n, with a test for coverage).
// error-codes.spec.ts fails when a code is raised in src/ or a procedure without being listed here.
// An unexpected status maps to `HTTP_<status>`; clients treat unknown codes generically.
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const ERROR_CODES = [
  'ACCOUNT_NOT_ACTIVE', 'ACCOUNT_PENDING_DELETION', 'ACCOUNT_SUSPENDED',
  'ADMIN_FORBIDDEN', 'ADMIN_LOCKED', 'ADMIN_NOT_FOUND',
  'APP_VERSION_UNSUPPORTED',
  'BLOCKED', 'CANNOT_BLOCK_SELF', 'CANNOT_FOLLOW_SELF', 'CANNOT_REPORT_SELF',
  'CAPTION_TOO_LONG', 'CHALLENGE_EXPIRED', 'COMMENT_NOT_FOUND', 'CSRF_CHECK_FAILED',
  'EMAIL_TAKEN', 'FORBIDDEN',
  'IDEMPOTENCY_KEY_REUSED', 'INTERNAL_ERROR',
  'INVALID_CREDENTIALS', 'INVALID_CURSOR', 'INVALID_IDEMPOTENCY_KEY', 'INVALID_PASSWORD',
  'INVALID_STATE', 'INVALID_TOTP', 'INVALID_VARIANT_KEY',
  'INVITE_INVALID', 'INVITE_NOT_FOUND',
  'MEDIA_NOT_ATTACHABLE', 'MEDIA_NOT_FOUND', 'MEDIA_NOT_UPLOADED',
  'NOT_FOUND', 'NOT_OWNER', 'NOTE_REQUIRED',
  'PASSWORD_TOO_COMMON', 'PASSWORD_TOO_SHORT', 'PAYLOAD_TOO_LARGE', 'POST_NOT_FOUND',
  'RATE_LIMITED', 'REPORT_ALREADY_HANDLED', 'REPORT_NOT_FOUND',
  'RESET_CODE_EXPIRED', 'RESET_CODE_INVALID', 'RESET_CODE_LOCKED',
  'SERVICE_UNAVAILABLE', 'SESSION_EXPIRED', 'SESSION_INVALID', 'SESSION_REUSE_DETECTED',
  'TOKEN_INVALID', 'UNAUTHORIZED', 'UNDER_MINIMUM_AGE', 'USER_NOT_FOUND', 'USERNAME_TAKEN',
  'VALIDATION_FAILED',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

class ApiErrorDetail {
  @ApiProperty({ enum: ERROR_CODES, description: 'Stable: translate this, not `message`' }) code!: ErrorCode;
  @ApiProperty({ description: 'English, for developers' }) message!: string;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true, description: 'e.g. { fields: [...] } for VALIDATION_FAILED, { minVersion } for APP_VERSION_UNSUPPORTED' })
  details?: Record<string, unknown>;
}

/** The error envelope of every failed request (TRD API-05). */
export class ApiErrorBody {
  @ApiProperty({ type: ApiErrorDetail }) error!: ApiErrorDetail;
  @ApiProperty({ description: 'Same as the X-Request-Id header' }) requestId!: string;
}
