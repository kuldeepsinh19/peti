import { beforeEach, describe, expect, it } from "vitest";
import { extractPgError } from "@/shared/infrastructure/pg-error";
import { createOutfit, createUser, db, insertBookingRow, rawClient, resetDatabase } from "../support/db";

/**
 * The database is the last line of defence (ADR-003). These tests bypass every use case and prove that
 * the constraints and triggers themselves reject invalid data.
 */
async function pgFailure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    const info = extractPgError(error);
    if (!info) throw error;
    return info;
  }
  throw new Error("Expected the database to reject the operation");
}

beforeEach(async () => {
  await resetDatabase();
});

describe("bookings", () => {
  it("rejects an owner renting their own outfit", async () => {
    const outfit = await createOutfit();
    const info = await pgFailure(
      insertBookingRow({ outfitId: outfit.id, ownerId: outfit.ownerId, renterId: outfit.ownerId }),
    );
    expect(info).toMatchObject({ sqlState: "23514", constraint: "bookings_owner_not_renter" });
  });

  it("rejects a booking whose owner is not the outfit's owner (composite foreign key)", async () => {
    const outfit = await createOutfit();
    const [impostor, renter] = await Promise.all([createUser(), createUser()]);
    const info = await pgFailure(
      insertBookingRow({ outfitId: outfit.id, ownerId: impostor.id, renterId: renter.id }),
    );
    expect(info.sqlState).toBe("23503");
  });

  it("only allows new bookings to start in PENDING_APPROVAL", async () => {
    const outfit = await createOutfit();
    const renter = await createUser();
    const booking = await insertBookingRow({
      outfitId: outfit.id,
      ownerId: outfit.ownerId,
      renterId: renter.id,
    });
    expect(booking.status).toBe("PENDING_APPROVAL");

    const client = await rawClient();
    try {
      const info = await pgFailure(
        client.query(
          `INSERT INTO bookings (reference, outfit_id, owner_id, renter_id, start_date, end_date, rental_days,
             buffer_days, status, rental_fee_paise, deposit_paise, commission_rate_bps, commission_paise,
             renter_total_paise, owner_payout_paise, late_fee_per_day_paise, terms_version, policy_snapshot,
             renter_accepted_at, updated_at)
           VALUES ('PT-ABC123', $1, $2, $3, '2027-02-01', '2027-02-03', 3, 1, 'CONFIRMED', 100, 0, 1500, 15,
             100, 85, 50, 't', '{}', now(), now())`,
          [outfit.id, outfit.ownerId, renter.id],
        ),
      );
      expect(info).toMatchObject({ sqlState: "23514", constraint: "bookings_initial_status" });
    } finally {
      await client.end();
    }
  });

  it("rejects status changes that are not in the transition table", async () => {
    const outfit = await createOutfit();
    const renter = await createUser();
    const booking = await insertBookingRow({
      outfitId: outfit.id,
      ownerId: outfit.ownerId,
      renterId: renter.id,
    });

    const info = await pgFailure(
      db.booking.update({ where: { id: booking.id }, data: { status: "COMPLETED" } }),
    );
    expect(info).toMatchObject({ sqlState: "23514", constraint: "bookings_legal_transition" });

    const moved = await db.booking.update({
      where: { id: booking.id },
      data: { status: "AWAITING_PAYMENT" },
    });
    expect(moved.status).toBe("AWAITING_PAYMENT");
  });

  it("keeps the pricing snapshot immutable", async () => {
    const outfit = await createOutfit();
    const renter = await createUser();
    const booking = await insertBookingRow({
      outfitId: outfit.id,
      ownerId: outfit.ownerId,
      renterId: renter.id,
    });
    const info = await pgFailure(
      db.booking.update({ where: { id: booking.id }, data: { rentalFeePaise: 1 } }),
    );
    expect(info).toMatchObject({ sqlState: "23514", constraint: "bookings_snapshot_immutable" });
  });

  it("allows only one pending request per renter, outfit and start date", async () => {
    const outfit = await createOutfit();
    const renter = await createUser();
    await insertBookingRow({ outfitId: outfit.id, ownerId: outfit.ownerId, renterId: renter.id });
    const info = await pgFailure(
      insertBookingRow({ outfitId: outfit.id, ownerId: outfit.ownerId, renterId: renter.id }),
    );
    expect(info).toMatchObject({ sqlState: "23505" });
  });
});

describe("history and audit", () => {
  it("are append-only", async () => {
    const outfit = await createOutfit();
    const renter = await createUser();
    const booking = await insertBookingRow({
      outfitId: outfit.id,
      ownerId: outfit.ownerId,
      renterId: renter.id,
    });
    const entry = await db.bookingStatusHistory.create({
      data: {
        bookingId: booking.id,
        toStatus: "PENDING_APPROVAL",
        command: "test",
        actorRole: "RENTER",
        actorUserId: renter.id,
      },
    });
    const updateInfo = await pgFailure(
      db.bookingStatusHistory.update({ where: { id: entry.id }, data: { reason: "rewritten" } }),
    );
    expect(updateInfo.constraint).toBe("booking_status_history_append_only");
    const deleteInfo = await pgFailure(db.bookingStatusHistory.delete({ where: { id: entry.id } }));
    expect(deleteInfo.constraint).toBe("booking_status_history_append_only");

    const log = await db.auditLog.create({
      data: { actorRole: "ADMIN", actorUserId: renter.id, action: "test", entityType: "x", entityId: "1" },
    });
    const auditInfo = await pgFailure(db.auditLog.delete({ where: { id: log.id } }));
    expect(auditInfo.constraint).toBe("audit_logs_append_only");
  });
});

describe("calendar_holds_no_overlap", () => {
  async function block(outfitId: string, createdById: string, startsOn: string, endsBefore: string) {
    return db.calendarHold.create({
      data: {
        outfitId,
        kind: "OWNER_BLOCK",
        startsOn: new Date(`${startsOn}T00:00:00Z`),
        endsBefore: new Date(`${endsBefore}T00:00:00Z`),
        createdById,
      },
    });
  }

  it("rejects overlapping holds for the same outfit but allows adjacent and other outfits", async () => {
    const outfit = await createOutfit();
    const other = await createOutfit();
    await block(outfit.id, outfit.ownerId, "2027-03-10", "2027-03-14");

    const info = await pgFailure(block(outfit.id, outfit.ownerId, "2027-03-13", "2027-03-16"));
    expect(info).toMatchObject({ sqlState: "23P01", constraint: "calendar_holds_no_overlap" });

    // Half-open ranges: [10,14) and [14,17) touch but do not overlap.
    await expect(block(outfit.id, outfit.ownerId, "2027-03-14", "2027-03-17")).resolves.toBeDefined();
    await expect(block(other.id, other.ownerId, "2027-03-10", "2027-03-14")).resolves.toBeDefined();
  });

  it("ON CONFLICT ON CONSTRAINT … DO NOTHING returns no row instead of aborting the transaction", async () => {
    const outfit = await createOutfit();
    await block(outfit.id, outfit.ownerId, "2027-04-01", "2027-04-05");
    const rows = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO calendar_holds (outfit_id, kind, starts_on, ends_before, created_by)
      VALUES (${outfit.id}::uuid, 'OWNER_BLOCK', '2027-04-03'::date, '2027-04-06'::date, ${outfit.ownerId}::uuid)
      ON CONFLICT ON CONSTRAINT calendar_holds_no_overlap DO NOTHING
      RETURNING id`;
    expect(rows).toHaveLength(0);
  });

  it("blocks a concurrent overlapping insert until the first commits, then rejects it", async () => {
    const outfit = await createOutfit();
    const a = await rawClient();
    const b = await rawClient();
    const insert = (client: typeof a, start: string, end: string) =>
      client.query(
        `INSERT INTO calendar_holds (outfit_id, kind, starts_on, ends_before, created_by)
         VALUES ($1, 'OWNER_BLOCK', $2, $3, $4)`,
        [outfit.id, start, end, outfit.ownerId],
      );
    try {
      await a.query("BEGIN");
      await insert(a, "2027-05-10", "2027-05-14");

      let settled = false;
      const second = insert(b, "2027-05-12", "2027-05-15").finally(() => {
        settled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(settled).toBe(false); // B waits on A's uncommitted row

      await a.query("COMMIT");
      const info = await pgFailure(second);
      expect(info).toMatchObject({ sqlState: "23P01", constraint: "calendar_holds_no_overlap" });
    } finally {
      await Promise.all([a.end(), b.end()]);
    }
  });

  it("lets the waiting insert succeed when the first transaction rolls back", async () => {
    const outfit = await createOutfit();
    const a = await rawClient();
    const b = await rawClient();
    const sql = `INSERT INTO calendar_holds (outfit_id, kind, starts_on, ends_before, created_by)
                 VALUES ($1, 'OWNER_BLOCK', $2, $3, $4)`;
    try {
      await a.query("BEGIN");
      await a.query(sql, [outfit.id, "2027-06-10", "2027-06-14", outfit.ownerId]);
      const second = b.query(sql, [outfit.id, "2027-06-12", "2027-06-15", outfit.ownerId]);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await a.query("ROLLBACK");
      await expect(second).resolves.toMatchObject({ rowCount: 1 });
    } finally {
      await Promise.all([a.end(), b.end()]);
    }
  });
});

describe("money", () => {
  it("never lets refunds exceed the captured amount", async () => {
    const outfit = await createOutfit();
    const renter = await createUser();
    const booking = await insertBookingRow({
      outfitId: outfit.id,
      ownerId: outfit.ownerId,
      renterId: renter.id,
    });
    const payment = await db.payment.create({
      data: {
        bookingId: booking.id,
        provider: "sandbox",
        providerOrderId: "order_1",
        providerPaymentId: "pay_1",
        amountPaise: 950_000,
        status: "CAPTURED",
        capturedAt: new Date(),
      },
    });
    const info = await pgFailure(
      db.payment.update({ where: { id: payment.id }, data: { refundedPaise: 950_001 } }),
    );
    expect(info).toMatchObject({ sqlState: "23514", constraint: "payments_refunded_within_amount" });
  });

  it("keeps deposit status consistent with the amount withheld", async () => {
    const outfit = await createOutfit();
    const renter = await createUser();
    const booking = await insertBookingRow({
      outfitId: outfit.id,
      ownerId: outfit.ownerId,
      renterId: renter.id,
    });
    const payment = await db.payment.create({
      data: { bookingId: booking.id, provider: "sandbox", amountPaise: 950_000 },
    });
    const info = await pgFailure(
      db.securityDeposit.create({
        data: {
          bookingId: booking.id,
          paymentId: payment.id,
          amountPaise: 500_000,
          status: "RELEASED",
          lateFeePaise: 1_000,
          withheldPaise: 1_000,
          settledAt: new Date(),
        },
      }),
    );
    expect(info.constraint).toBe("security_deposits_status_consistent");
  });
});
