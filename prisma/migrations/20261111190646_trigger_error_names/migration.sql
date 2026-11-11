-- Prisma's pg driver adapter does not pass the `constraint` field of a Postgres error through to the
-- application, only the SQLSTATE and message. Trigger-raised errors therefore start their message with
-- the constraint name ("name: …") so src/shared/infrastructure/pg-error.ts can map them to domain errors.

CREATE OR REPLACE FUNCTION bookings_guard_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'PENDING_APPROVAL' THEN
      RAISE EXCEPTION 'bookings_initial_status: bookings must start in PENDING_APPROVAL, not %', NEW.status
        USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_initial_status';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NOT EXISTS (
      SELECT 1 FROM booking_allowed_transitions
      WHERE from_status = OLD.status AND to_status = NEW.status) THEN
    RAISE EXCEPTION 'bookings_legal_transition: illegal booking transition % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_legal_transition';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION bookings_guard_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.outfit_id, NEW.owner_id, NEW.renter_id, NEW.start_date, NEW.end_date, NEW.rental_days,
      NEW.buffer_days, NEW.rental_fee_paise, NEW.deposit_paise, NEW.commission_rate_bps,
      NEW.commission_paise, NEW.renter_total_paise, NEW.owner_payout_paise, NEW.late_fee_per_day_paise,
      NEW.terms_version, NEW.reference)
     IS DISTINCT FROM
     (OLD.outfit_id, OLD.owner_id, OLD.renter_id, OLD.start_date, OLD.end_date, OLD.rental_days,
      OLD.buffer_days, OLD.rental_fee_paise, OLD.deposit_paise, OLD.commission_rate_bps,
      OLD.commission_paise, OLD.renter_total_paise, OLD.owner_payout_paise, OLD.late_fee_per_day_paise,
      OLD.terms_version, OLD.reference) THEN
    RAISE EXCEPTION 'bookings_snapshot_immutable: booking parties and pricing snapshot cannot change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_snapshot_immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%_append_only: % is append-only', TG_TABLE_NAME, TG_TABLE_NAME
    USING ERRCODE = 'check_violation', CONSTRAINT = TG_TABLE_NAME || '_append_only';
END $$;
