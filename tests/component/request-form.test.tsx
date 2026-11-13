import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { RequestForm, type RequestFormProps } from "@/modules/bookings/ui/request-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

function renderForm(overrides: Partial<RequestFormProps> = {}) {
  const action = vi.fn<RequestFormProps["action"]>(async () => ({
    ok: true as const,
    data: { redirectTo: "/account/rentals/b1?requested=1" },
  }));
  render(
    <RequestForm
      outfitId="outfit-1"
      prices={[
        { durationDays: 3, pricePaise: 450_000 },
        { durationDays: 5, pricePaise: 650_000 },
      ]}
      depositPaise={800_000}
      turnaroundDays={1}
      // Held 15–18 December (half-open: ends before the 19th).
      unavailable={[{ startsOn: "2026-12-15", endsBefore: "2026-12-19" }]}
      earliestStart="2026-12-03"
      latestStart="2027-05-31"
      action={action}
      {...overrides}
    />,
  );
  return { action, user: userEvent.setup() };
}

const day = (n: number) =>
  screen.getByRole("button", { name: new RegExp(`December ${n}(st|nd|rd|th)?, 2026`) });
const breakdown = (term: string) => screen.getByText(term).nextElementSibling as HTMLElement;

describe("RequestForm", () => {
  it("previews the price for the chosen duration, deposit included", async () => {
    const { user } = renderForm();
    expect(breakdown("Rental fee (3 days)")).toHaveTextContent("₹4,500");
    expect(breakdown("Refundable deposit")).toHaveTextContent("₹8,000");
    expect(breakdown("Total to pay once approved")).toHaveTextContent("₹12,500");

    await user.click(screen.getByLabelText(/5 days/));
    expect(breakdown("Rental fee (5 days)")).toHaveTextContent("₹6,500");
    expect(breakdown("Total to pay once approved")).toHaveTextContent("₹14,500");
  });

  it("disables held dates, dates before the earliest start, and starts whose rental and cleaning day would clash", () => {
    renderForm();
    expect(day(2)).toBeDisabled(); // before the earliest start
    expect(day(16)).toBeDisabled(); // held
    expect(day(12)).toBeDisabled(); // 12–14 plus a cleaning day on the 15th runs into the hold
    expect(day(11)).toBeEnabled(); // 11–13, cleaning on the 14th
    expect(day(19)).toBeEnabled(); // the hold has ended
  });

  it("sends the request only with a date and accepted terms, as an ISO date", async () => {
    const { user, action } = renderForm();
    const send = screen.getByRole("button", { name: "Send request" });
    expect(send).toBeDisabled();

    await user.click(day(11));
    expect(breakdown("Dates")).toHaveTextContent(/11 Dec 2026 – 13 Dec 2026/);
    expect(send).toBeDisabled();

    await user.click(screen.getByRole("checkbox"));
    await user.click(send);
    expect(action).toHaveBeenCalledWith({
      outfitId: "outfit-1",
      startDate: "2026-12-11",
      days: 3,
      note: "",
      acceptTerms: true,
    });
    expect(push).toHaveBeenCalledWith("/account/rentals/b1?requested=1");
  });

  it("shows the server's message when the request is refused", async () => {
    const { user, action } = renderForm();
    action.mockResolvedValueOnce({
      ok: false,
      error: { code: "DATES_UNAVAILABLE", message: "Those dates have just been taken." },
    });
    await user.click(day(11));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Send request" }));
    expect(await screen.findByText("Those dates have just been taken.")).toBeInTheDocument();
    expect(within(document.body).queryByText(/Choose a start date\./)).toBeNull();
  });

  it("recovers when the request never reaches the server, instead of spinning forever", async () => {
    const { user, action } = renderForm();
    action.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await user.click(day(11));
    await user.click(screen.getByRole("checkbox"));
    const send = screen.getByRole("button", { name: "Send request" });
    await user.click(send);
    expect(await screen.findByText(/did not reach Peti/)).toBeInTheDocument();
    expect(send).toBeEnabled();
  });
});
