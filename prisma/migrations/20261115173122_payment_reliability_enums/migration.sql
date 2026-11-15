-- Phase 2 payment reliability (ADR-006). Enum values get their own migration: PostgreSQL cannot use a
-- value added by ALTER TYPE ... ADD VALUE in the same transaction, and the next migration's constraints
-- reference them.
-- AlterEnum
ALTER TYPE "PayoutStatus" ADD VALUE 'FAILED';

-- AlterEnum
ALTER TYPE "RefundReason" ADD VALUE 'UNEXPECTED_CAPTURE_REVERSAL';
