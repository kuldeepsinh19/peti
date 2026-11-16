import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RentalPolicies } from "@/modules/bookings/ui/rental-policies";

describe("RentalPolicies", () => {
  it("states the policy the booking and settlement code applies", () => {
    render(<RentalPolicies depositPaise={800_000} turnaroundDays={2} />);
    const text = (term: string) => screen.getByText(term).nextElementSibling?.textContent ?? "";
    expect(text("Requests")).toBe(
      "The owner answers within 24 hours. You pay only after they approve, within 12 hours.",
    );
    expect(text("Deposit")).toContain("₹8,000");
    expect(text("Deposit")).toContain("2 days to check it");
    expect(text("Cancelling")).toBe(
      "Your deposit is always refunded; full refund of the rental fee 7 days or more before the start; 50% between 2 days and 7 days; no refund of the fee within 2 days.",
    );
    expect(text("Cleaning")).toBe("The owner keeps 2 days after each rental to clean it.");
  });
});
