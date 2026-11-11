-- Integrity constraints that Prisma's schema language cannot express.
-- See docs/decisions/ADR-003-database-design.md and ADR-004-booking-concurrency.md.
-- Every object is named: src/shared/infrastructure/pg-error.ts maps constraint names to domain errors.

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Users and addresses ─────────────────────────────────────────────────────────────────────────

ALTER TABLE users
  ADD CONSTRAINT users_phone_format CHECK (phone_number IS NULL OR phone_number ~ '^\+91[6-9][0-9]{9}$'),
  ADD CONSTRAINT users_role_valid CHECK (role IN ('user', 'admin'));

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_display_name_length CHECK (char_length(display_name) BETWEEN 2 AND 60),
  ADD CONSTRAINT user_profiles_bio_length CHECK (bio IS NULL OR char_length(bio) <= 500),
  ADD CONSTRAINT user_profiles_counts_non_negative CHECK (
    owner_rating_sum >= 0 AND owner_rating_count >= 0 AND renter_rating_sum >= 0
    AND renter_rating_count >= 0 AND owner_cancellation_count >= 0);

ALTER TABLE addresses
  ADD CONSTRAINT addresses_pincode_format CHECK (pincode ~ '^[1-9][0-9]{5}$');

CREATE UNIQUE INDEX addresses_one_default_per_user
  ON addresses (user_id) WHERE is_default AND deleted_at IS NULL;

-- ─── Catalogue ───────────────────────────────────────────────────────────────────────────────────

ALTER TABLE outfits
  ADD CONSTRAINT outfits_title_length CHECK (char_length(title) BETWEEN 5 AND 120),
  ADD CONSTRAINT outfits_money_valid CHECK (
    retail_value_paise > 0 AND retail_value_paise <= 2000000000
    AND deposit_paise >= 50000 AND deposit_paise <= retail_value_paise),
  ADD CONSTRAINT outfits_min_price_positive CHECK (min_price_paise IS NULL OR min_price_paise > 0),
  ADD CONSTRAINT outfits_active_has_price CHECK (status <> 'ACTIVE' OR min_price_paise IS NOT NULL),
  ADD CONSTRAINT outfits_turnaround_range CHECK (turnaround_days BETWEEN 0 AND 7);

ALTER TABLE outfit_price_options
  ADD CONSTRAINT outfit_price_options_duration_range CHECK (duration_days BETWEEN 1 AND 30),
  ADD CONSTRAINT outfit_price_options_price_valid CHECK (price_paise > 0 AND price_paise <= 2000000000);

ALTER TABLE outfit_measurements
  ADD CONSTRAINT outfit_measurements_range CHECK (
        (chest_mm IS NULL OR chest_mm BETWEEN 100 AND 3000)
    AND (waist_mm IS NULL OR waist_mm BETWEEN 100 AND 3000)
    AND (hip_mm IS NULL OR hip_mm BETWEEN 100 AND 3000)
    AND (shoulder_mm IS NULL OR shoulder_mm BETWEEN 100 AND 3000)
    AND (sleeve_mm IS NULL OR sleeve_mm BETWEEN 100 AND 3000)
    AND (length_mm IS NULL OR length_mm BETWEEN 100 AND 3000)
    AND (bottom_waist_mm IS NULL OR bottom_waist_mm BETWEEN 100 AND 3000)
    AND (bottom_length_mm IS NULL OR bottom_length_mm BETWEEN 100 AND 3000));

-- Discovery indexes, limited to what discovery can see.
CREATE INDEX outfits_active_category_price_idx ON outfits (category_id, min_price_paise) WHERE status = 'ACTIVE';
CREATE INDEX outfits_active_locality_idx ON outfits (locality_id) WHERE status = 'ACTIVE';
CREATE INDEX outfits_active_size_idx ON outfits (size_label) WHERE status = 'ACTIVE';
CREATE INDEX outfits_active_occasions_idx ON outfits USING gin (occasions) WHERE status = 'ACTIVE';
CREATE INDEX outfits_pending_review_idx ON outfits (submitted_at) WHERE status = 'PENDING_REVIEW';

-- Keyword search: 'simple' configuration (no English stemming of garment names or transliterated
-- Hindi/Gujarati) plus trigram similarity on titles for misspellings ("lehnga").
CREATE FUNCTION outfit_search_document(title text, brand text, colour text, fabric text, description text)
RETURNS tsvector LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT setweight(to_tsvector('simple'::regconfig, coalesce(title, '')), 'A')
      || setweight(to_tsvector('simple'::regconfig,
           coalesce(brand, '') || ' ' || coalesce(colour, '') || ' ' || coalesce(fabric, '')), 'B')
      || setweight(to_tsvector('simple'::regconfig, coalesce(description, '')), 'C')
$$;

CREATE INDEX outfits_search_idx ON outfits
  USING gin (outfit_search_document(title, brand, colour, fabric, description)) WHERE status = 'ACTIVE';

CREATE INDEX outfits_title_trgm_idx ON outfits USING gin (lower(title) gin_trgm_ops) WHERE status = 'ACTIVE';

-- ─── Calendar holds: the no-double-booking guarantee ─────────────────────────────────────────────

ALTER TABLE calendar_holds
  ADD CONSTRAINT calendar_holds_range_valid CHECK (starts_on < ends_before),
  ADD CONSTRAINT calendar_holds_kind_matches_booking CHECK ((kind = 'BOOKING') = (booking_id IS NOT NULL)),
  ADD CONSTRAINT calendar_holds_no_overlap
    EXCLUDE USING gist (outfit_id WITH =, (daterange(starts_on, ends_before, '[)')) WITH &&);

-- ─── Bookings ────────────────────────────────────────────────────────────────────────────────────

ALTER TABLE bookings
  ADD CONSTRAINT bookings_owner_not_renter CHECK (owner_id <> renter_id),
  ADD CONSTRAINT bookings_dates_valid CHECK (
    end_date >= start_date AND rental_days = (end_date - start_date) + 1),
  ADD CONSTRAINT bookings_buffer_range CHECK (buffer_days BETWEEN 0 AND 7),
  ADD CONSTRAINT bookings_money_valid CHECK (
    rental_fee_paise > 0 AND deposit_paise >= 0 AND commission_paise >= 0
    AND late_fee_per_day_paise >= 0),
  ADD CONSTRAINT bookings_commission_rate_range CHECK (commission_rate_bps BETWEEN 0 AND 10000),
  ADD CONSTRAINT bookings_commission_within_fee CHECK (commission_paise <= rental_fee_paise),
  ADD CONSTRAINT bookings_renter_total_identity CHECK (renter_total_paise = rental_fee_paise + deposit_paise),
  ADD CONSTRAINT bookings_owner_payout_identity CHECK (owner_payout_paise = rental_fee_paise - commission_paise),
  ADD CONSTRAINT bookings_closed_reason_matches_status CHECK (
    (status IN ('CANCELLED', 'REJECTED', 'EXPIRED')) = (closed_reason IS NOT NULL)),
  ADD CONSTRAINT bookings_late_values_valid CHECK (
    (late_days IS NULL OR late_days >= 0) AND (late_fee_paise IS NULL OR late_fee_paise >= 0)),
  ADD CONSTRAINT bookings_reference_format CHECK (reference ~ '^PT-[0-9A-Z]{6}$');

-- One live request per renter, outfit and start date.
CREATE UNIQUE INDEX bookings_one_pending_request
  ON bookings (outfit_id, renter_id, start_date) WHERE status = 'PENDING_APPROVAL';

-- Deadline scans for the sweep.
CREATE INDEX bookings_open_deadlines_idx
  ON bookings (expires_at) WHERE status IN ('PENDING_APPROVAL', 'AWAITING_PAYMENT');
CREATE INDEX bookings_inspection_deadline_idx
  ON bookings (inspection_deadline) WHERE status = 'RETURNED';
CREATE INDEX bookings_active_end_date_idx
  ON bookings (end_date) WHERE status = 'ACTIVE';

-- Legal transitions. Seeded from src/modules/bookings/domain/booking-state-machine.ts; an integration
-- test asserts the two are identical.
INSERT INTO booking_allowed_transitions (from_status, to_status) VALUES
  ('PENDING_APPROVAL', 'AWAITING_PAYMENT'),
  ('PENDING_APPROVAL', 'REJECTED'),
  ('PENDING_APPROVAL', 'CANCELLED'),
  ('PENDING_APPROVAL', 'EXPIRED'),
  ('AWAITING_PAYMENT', 'CONFIRMED'),
  ('AWAITING_PAYMENT', 'EXPIRED'),
  ('AWAITING_PAYMENT', 'CANCELLED'),
  ('CONFIRMED', 'ACTIVE'),
  ('CONFIRMED', 'CANCELLED'),
  ('CONFIRMED', 'DISPUTED'),
  ('ACTIVE', 'RETURNED'),
  ('ACTIVE', 'DISPUTED'),
  ('RETURNED', 'COMPLETED'),
  ('RETURNED', 'DISPUTED'),
  ('DISPUTED', 'COMPLETED'),
  ('DISPUTED', 'CANCELLED');

CREATE FUNCTION bookings_guard_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'PENDING_APPROVAL' THEN
      RAISE EXCEPTION 'bookings must start in PENDING_APPROVAL, not %', NEW.status
        USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_initial_status';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NOT EXISTS (
      SELECT 1 FROM booking_allowed_transitions
      WHERE from_status = OLD.status AND to_status = NEW.status) THEN
    RAISE EXCEPTION 'illegal booking transition % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_legal_transition';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER bookings_guard_status
  BEFORE INSERT OR UPDATE OF status ON bookings
  FOR EACH ROW EXECUTE FUNCTION bookings_guard_status();

-- The parties and pricing snapshot of a booking never change after insert.
CREATE FUNCTION bookings_guard_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
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
    RAISE EXCEPTION 'booking snapshot is immutable'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'bookings_snapshot_immutable';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER bookings_guard_snapshot
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION bookings_guard_snapshot();

-- ─── Append-only history and audit ───────────────────────────────────────────────────────────────

CREATE FUNCTION reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = 'check_violation', CONSTRAINT = TG_TABLE_NAME || '_append_only';
END $$;

CREATE TRIGGER booking_status_history_append_only
  BEFORE UPDATE OR DELETE ON booking_status_history
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();

ALTER TABLE booking_status_history
  ADD CONSTRAINT booking_status_history_actor_consistent CHECK (
    (actor_role = 'SYSTEM') = (actor_user_id IS NULL));

-- ─── Money ───────────────────────────────────────────────────────────────────────────────────────

ALTER TABLE payments
  ADD CONSTRAINT payments_provider_valid CHECK (provider IN ('sandbox', 'razorpay')),
  ADD CONSTRAINT payments_amount_positive CHECK (amount_paise > 0),
  ADD CONSTRAINT payments_currency_inr CHECK (currency = 'INR'),
  ADD CONSTRAINT payments_refunded_within_amount CHECK (refunded_paise BETWEEN 0 AND amount_paise),
  ADD CONSTRAINT payments_refund_requires_capture CHECK (refunded_paise = 0 OR status = 'CAPTURED'),
  ADD CONSTRAINT payments_captured_at_matches CHECK ((status = 'CAPTURED') = (captured_at IS NOT NULL)),
  ADD CONSTRAINT payments_provider_payment_id_present CHECK (
    status NOT IN ('AUTHORIZED', 'CAPTURED') OR provider_payment_id IS NOT NULL);

ALTER TABLE refunds
  ADD CONSTRAINT refunds_amounts_valid CHECK (
    amount_paise > 0 AND rental_fee_portion_paise >= 0 AND deposit_portion_paise >= 0
    AND amount_paise = rental_fee_portion_paise + deposit_portion_paise);

CREATE UNIQUE INDEX refunds_one_per_payment_reason
  ON refunds (payment_id, reason) WHERE reason <> 'ADMIN_ADJUSTMENT';
CREATE INDEX refunds_outstanding_idx
  ON refunds (status, created_at) WHERE status IN ('PENDING', 'INITIATED');

ALTER TABLE security_deposits
  ADD CONSTRAINT security_deposits_withheld_identity CHECK (
    withheld_paise = late_fee_paise + damage_paise
    AND late_fee_paise >= 0 AND damage_paise >= 0
    AND withheld_paise BETWEEN 0 AND amount_paise),
  ADD CONSTRAINT security_deposits_status_consistent CHECK (
       (status = 'HELD' AND withheld_paise = 0 AND settled_at IS NULL)
    OR (status = 'RELEASED' AND withheld_paise = 0 AND settled_at IS NOT NULL)
    OR (status = 'PARTIALLY_WITHHELD' AND withheld_paise > 0 AND withheld_paise < amount_paise
        AND settled_at IS NOT NULL)
    OR (status = 'FORFEITED' AND withheld_paise = amount_paise AND amount_paise > 0
        AND settled_at IS NOT NULL));

ALTER TABLE payouts
  ADD CONSTRAINT payouts_net_identity CHECK (
    net_paise = gross_rental_paise - commission_paise + deposit_withheld_paise
    AND gross_rental_paise >= 0 AND commission_paise >= 0 AND deposit_withheld_paise >= 0
    AND commission_paise <= gross_rental_paise AND net_paise > 0),
  ADD CONSTRAINT payouts_paid_consistent CHECK (
    (status = 'PAID') = (paid_at IS NOT NULL AND paid_by IS NOT NULL AND payout_reference IS NOT NULL));

-- Conservation: for every closed booking with a captured payment,
-- captured = refunded (not failed) + owner payout + commission. Every row must show imbalance = 0.
CREATE VIEW v_booking_money_reconciliation AS
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
  FROM refunds WHERE status <> 'FAILED' GROUP BY payment_id
) r ON r.payment_id = p.id
LEFT JOIN payouts po ON po.booking_id = b.id AND po.status <> 'CANCELLED'
WHERE b.status IN ('COMPLETED', 'CANCELLED', 'EXPIRED', 'REJECTED');

-- ─── Condition reports, reviews, disputes ────────────────────────────────────────────────────────

ALTER TABLE reviews
  ADD CONSTRAINT reviews_rating_range CHECK (rating BETWEEN 1 AND 5),
  ADD CONSTRAINT reviews_not_self CHECK (author_id <> subject_id),
  ADD CONSTRAINT reviews_comment_length CHECK (comment IS NULL OR char_length(comment) <= 1000);

ALTER TABLE disputes
  ADD CONSTRAINT disputes_resolved_consistent CHECK (
    (status = 'RESOLVED') = (resolution IS NOT NULL AND resolved_at IS NOT NULL)),
  ADD CONSTRAINT disputes_amounts_valid CHECK (
    (claimed_amount_paise IS NULL OR claimed_amount_paise > 0)
    AND (awarded_deposit_paise IS NULL OR awarded_deposit_paise >= 0)
    AND (rental_refund_paise IS NULL OR rental_refund_paise >= 0)),
  ADD CONSTRAINT disputes_opener_consistent CHECK ((opened_by_role = 'SYSTEM') = (opened_by IS NULL));

CREATE UNIQUE INDEX disputes_one_open_per_booking ON disputes (booking_id) WHERE status = 'OPEN';

CREATE INDEX notifications_pending_idx ON notifications (created_at)
  WHERE status = 'PENDING' AND channel <> 'IN_APP';
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL AND channel = 'IN_APP';
