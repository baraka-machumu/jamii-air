-- Increment A 2026-10-27 (BRS §6.2): the notification types private accounts need. Enum values
-- live in their OWN migration on purpose: Postgres refuses to use a value added by
-- ALTER TYPE ... ADD VALUE inside the same transaction, and the next migration's indexes and
-- procedures do exactly that.

-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE 'FOLLOW_REQUEST';
ALTER TYPE "notification_type" ADD VALUE 'FOLLOW_ACCEPTED';
