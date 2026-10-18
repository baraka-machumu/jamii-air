-- R1 scope change 2026-10-16 (BRS §6.1): the enum values that video posts, video variants and
-- comment replies need. Enum values live in their OWN migration on purpose: Postgres refuses to
-- use a value added by ALTER TYPE ... ADD VALUE inside the same transaction, and the next
-- migration's CHECK constraints and procedures do exactly that.

-- AlterEnum
ALTER TYPE "media_kind" ADD VALUE 'VIDEO';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "media_variant_type" ADD VALUE 'POSTER';
ALTER TYPE "media_variant_type" ADD VALUE 'VIDEO_720';

-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE 'REPLY';

-- AlterEnum
ALTER TYPE "post_type" ADD VALUE 'VIDEO';
