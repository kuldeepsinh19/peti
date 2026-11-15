-- CreateEnum
CREATE TYPE "PaymentDisputeStatus" AS ENUM ('OPEN', 'WON', 'LOST', 'CLOSED');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "capture_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_capture_error" TEXT,
ADD COLUMN     "last_reconciled_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "payouts" ADD COLUMN     "failure_reason" TEXT;

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "reversed_provider_payment_id" TEXT;

-- CreateTable
CREATE TABLE "payment_disputes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" TEXT NOT NULL,
    "provider_dispute_id" TEXT NOT NULL,
    "provider_payment_id" TEXT NOT NULL,
    "payment_id" UUID,
    "booking_id" UUID,
    "status" "PaymentDisputeStatus" NOT NULL DEFAULT 'OPEN',
    "amount_paise" INTEGER NOT NULL,
    "reason_code" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_disputes_booking_id_status_idx" ON "payment_disputes"("booking_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_disputes_provider_provider_dispute_id_key" ON "payment_disputes"("provider", "provider_dispute_id");

-- AddForeignKey
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Hand-written integrity (ADR-006) ────────────────────────────────────────────────────────────

ALTER TABLE payments
  ADD CONSTRAINT payments_capture_attempts_valid CHECK (capture_attempts >= 0);

-- A reversal refund returns a provider payment that is not the booking's own capture (a second payment on
-- the order, or a wrong amount). It carries no fee or deposit portion and never counts towards
-- payments.refunded_paise; every other refund still splits exactly into fee and deposit portions.
ALTER TABLE refunds DROP CONSTRAINT refunds_amounts_valid;
ALTER TABLE refunds
  ADD CONSTRAINT refunds_amounts_valid CHECK (
    amount_paise > 0 AND rental_fee_portion_paise >= 0 AND deposit_portion_paise >= 0
    AND (
      (reason <> 'UNEXPECTED_CAPTURE_REVERSAL'
        AND amount_paise = rental_fee_portion_paise + deposit_portion_paise)
      OR (reason = 'UNEXPECTED_CAPTURE_REVERSAL'
        AND rental_fee_portion_paise = 0 AND deposit_portion_paise = 0))),
  ADD CONSTRAINT refunds_reversal_target CHECK (
    (reason = 'UNEXPECTED_CAPTURE_REVERSAL') = (reversed_provider_payment_id IS NOT NULL));

-- One settlement refund per payment and reason, as before; reversals are one per reversed provider payment
-- (so a webhook and a callback racing for the same stray capture queue it once).
DROP INDEX refunds_one_per_payment_reason;
CREATE UNIQUE INDEX refunds_one_per_payment_reason
  ON refunds (payment_id, reason) WHERE reason NOT IN ('ADMIN_ADJUSTMENT', 'UNEXPECTED_CAPTURE_REVERSAL');
CREATE UNIQUE INDEX refunds_one_reversal_per_provider_payment
  ON refunds (reversed_provider_payment_id) WHERE reversed_provider_payment_id IS NOT NULL;

-- A payout reported back as failed says why; any other status carries no failure reason.
ALTER TABLE payouts
  ADD CONSTRAINT payouts_failure_consistent CHECK ((status = 'FAILED') = (failure_reason IS NOT NULL));

ALTER TABLE payment_disputes
  ADD CONSTRAINT payment_disputes_amount_valid CHECK (amount_paise >= 0);

-- Conservation is unchanged for the booking's own money: reversals return money that never belonged to
-- the booking, so they are left out (and tracked by v_unexpected_captures instead).
CREATE OR REPLACE VIEW v_booking_money_reconciliation AS
SELECT b.id AS booking_id,
       b.reference,
       b.status,
       p.amount_paise AS captured_paise,
       COALESCE(r.refunded_paise, 0) AS refunded_paise,
       COALESCE(po.net_paise, 0) AS owner_net_paise,
       COALESCE(po.commission_paise, 0) AS commission_paise,
       p.amount_paise - COALESCE(r.refunded_paise, 0)
         - COALESCE(po.net_paise, 0) - COALESCE(po.commission_paise, 0) AS imbalance_paise
FROM bookings b
JOIN payments p ON p.booking_id = b.id AND p.status = 'CAPTURED'
LEFT JOIN (
  SELECT payment_id, SUM(amount_paise)::int AS refunded_paise
  FROM refunds WHERE status <> 'FAILED' AND reason <> 'UNEXPECTED_CAPTURE_REVERSAL' GROUP BY payment_id
) r ON r.payment_id = p.id
LEFT JOIN payouts po ON po.booking_id = b.id AND po.status <> 'CANCELLED'
WHERE b.status IN ('COMPLETED', 'CANCELLED', 'EXPIRED', 'REJECTED');

-- Every capture Peti could not apply, and whether the money has gone back to the payer.
CREATE VIEW v_unexpected_captures AS
SELECT r.id AS refund_id,
       r.booking_id,
       r.reversed_provider_payment_id,
       r.amount_paise,
       r.status,
       r.attempts,
       r.last_error,
       r.created_at,
       r.processed_at
FROM refunds r
WHERE r.reason = 'UNEXPECTED_CAPTURE_REVERSAL';
