import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import ErrorPage from "@/app/error";
import NotFound from "@/app/not-found";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

describe("error pages", () => {
  it("not found offers a way back", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Not here.");
    expect(screen.getByRole("link", { name: "Explore outfits" })).toHaveAttribute("href", "/explore");
  });

  it("an unexpected error shows the reference, never the internal message, and can retry", async () => {
    const reset = vi.fn();
    const error = Object.assign(new Error('relation "bookings" does not exist at db:5432'), {
      digest: "4192831",
    });
    render(<ErrorPage error={error} reset={reset} />);
    expect(screen.getByText("4192831")).toBeInTheDocument();
    expect(screen.queryByText(/relation|db:5432/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
