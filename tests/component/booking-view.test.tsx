import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { BookingDetail } from "@/modules/bookings/application/queries";
import { BookingView, type BookingViewProps } from "@/modules/bookings/ui/booking-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

type Role = "RENTER" | "OWNER" | "ADMIN";

function booking(overrides: Partial<BookingDetail> = {}): BookingDetail {
  return {
    id: "b1",
    reference: "PT-ABC123",
    status: "CONFIRMED",
    closedReason: null,
    outfit: {
      id: "o1",
      title: "Ivory sherwani",
      slug: "ivory-sherwani",
      photoKey: null,
      localityName: "Bodakdev",
    },
    owner: { id: "u-owner", name: "Kabir", phone: null },
    renter: { id: "u-renter", name: "Rohan", phone: null },
    pickupAddress: null,
    startDate: "2026-12-10",
    endDate: "2026-12-12",
    rentalDays: 3,
    bufferDays: 1,
    expiresAt: null,
    renterNote: null,
    money: {
      rentalFeePaise: 350_000,
      depositPaise: 600_000,
      commissionPaise: 52_500,
      renterTotalPaise: 950_000,
      ownerPayoutPaise: 297_500,
      lateFeePerDayPaise: 175_000,
      lateFeePaise: null,
      lateDays: null,
    },
    payment: null,
    deposit: null,
    refunds: [],
    payout: null,
    reports: [],
    dispute: null,
    history: [],
    inspectionDeadline: null,
    approvedAt: null,
    confirmedAt: null,
    completedAt: null,
    policy: {},
    createdAt: new Date("2026-11-20T10:00:00Z"),
    ...overrides,
  } as BookingDetail;
}

const handover = {
  kind: "HANDOVER" as const,
  grade: "GOOD",
  notes: "Fine.",
  authorName: "Kabir",
  createdAt: new Date("2026-12-09T10:00:00Z"),
  updatedAt: new Date("2026-12-09T10:00:00Z"),
  acknowledgedAt: null,
  counterpartyNotes: null,
  photoKeys: [],
};

function show(b: BookingDetail, role: Role, today: string, extra: Partial<BookingViewProps> = {}) {
  render(
    <BookingView
      booking={{ ...b, viewerRole: role }}
      returnTo="/account/rentals/b1"
      today={today}
      now={new Date(`${today}T06:00:00Z`)}
      command={vi.fn()}
      report={vi.fn()}
      checkout={vi.fn()}
      {...extra}
    />,
  );
}

describe("booking page: cancelling (#31)", () => {
  it("offers cancellation before the handover", () => {
    show(booking(), "RENTER", "2026-12-05");
    expect(screen.getByText("Cancel this booking")).toBeInTheDocument();
  });

  it("does not offer it once the handover is recorded", () => {
    show(booking({ reports: [handover] }), "RENTER", "2026-12-09");
    expect(screen.queryByText("Cancel this booking")).not.toBeInTheDocument();
  });

  it("does not offer it once the rental has started", () => {
    show(booking(), "OWNER", "2026-12-10");
    expect(screen.queryByText("Cancel this booking")).not.toBeInTheDocument();
  });
});

describe("booking page: contesting a late fee (#22)", () => {
  const returned = { status: "RETURNED" as const, reports: [handover] };

  it("is not offered when no late fee was charged", () => {
    show(booking(returned), "RENTER", "2026-12-12");
    expect(screen.queryByText("Report a problem")).not.toBeInTheDocument();
  });

  it("is offered when one was", () => {
    const money = { ...booking().money, lateFeePaise: 175_000, lateDays: 1 };
    show(booking({ ...returned, money }), "RENTER", "2026-12-13");
    expect(screen.getByText("Report a problem")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "I disagree with the late fee" })).toBeInTheDocument();
  });
});
