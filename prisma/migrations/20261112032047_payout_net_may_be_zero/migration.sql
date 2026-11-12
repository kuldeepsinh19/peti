-- A payout row also records the platform's commission on a retained fee. At a 100% commission rate the
-- owner's net is exactly zero but the row must still exist for the money to reconcile (found by the
-- settlement property test), so the net may be zero, never negative.
ALTER TABLE payouts DROP CONSTRAINT payouts_net_identity;

ALTER TABLE payouts
  ADD CONSTRAINT payouts_net_identity CHECK (
    net_paise = gross_rental_paise - commission_paise + deposit_withheld_paise
    AND gross_rental_paise >= 0 AND commission_paise >= 0 AND deposit_withheld_paise >= 0
    AND commission_paise <= gross_rental_paise AND net_paise >= 0);
