import { execSync } from "node:child_process";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { type Browser, expect, type Page, test } from "@playwright/test";

/**
 * The POC journeys that need more than one person or more than one day (docs/development/poc-demo-guide.md):
 * moderation, the handover-to-completion rental, a declined payment, a cancellation with its refund, and an
 * accessibility check of the key pages. Rentals use the ready-made bookings from `pnpm db:seed:bookings`,
 * dated relative to today; payments are the simulated sandbox.
 */
const PASSWORD = "peti-demo-password";
const fixture = (name: string) => path.join(process.cwd(), "tests", "e2e", "fixtures", name);

interface SeededBooking {
  scenario: string;
  stage: string;
  bookingId: string;
  reference: string;
  status: string;
  owner: string;
}

let seeded: { renter: string; bookings: SeededBooking[] } | null = null;

/** Runs the ready-made bookings seed (idempotent per day) and returns what it made. */
function readyMadeBookings() {
  if (!seeded) {
    const out = execSync("pnpm -s db:seed:bookings --json", { encoding: "utf8" });
    seeded = JSON.parse(out.trim().split("\n").pop()!) as { renter: string; bookings: SeededBooking[] };
  }
  return seeded;
}

/** The seeded booking for a scenario, or skips the test when an earlier run today already moved it on. */
function booking(scenario: string): SeededBooking {
  const b = readyMadeBookings().bookings.find((x) => x.scenario === scenario)!;
  test.skip(
    b.status !== b.stage,
    `${b.reference} was already used today (now ${b.status}); run on a fresh database or tomorrow`,
  );
  return b;
}

async function signedIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account/);
  return page;
}

async function runBackgroundJobs(page: Page) {
  await page.goto("/dev");
  await page.getByRole("button", { name: "Run background jobs now" }).click();
  await expect(page.getByText("Background jobs ran")).toBeVisible();
}

test("Journey 3: an administrator approves a submitted listing and it appears in Explore", async ({
  browser,
}) => {
  const owner = await signedIn(browser, "meera@peti.local");
  const title = `Saffron organza lehenga ${Date.now().toString(36)}`;
  await owner.goto("/lend/outfits/new");
  await owner.getByLabel("Outfit name").fill(title);
  await owner.getByLabel("Category").selectOption({ index: 1 });
  await owner.getByLabel("Size").selectOption("M");
  await owner
    .getByLabel("Description")
    .fill("Worn once for a sangeet. Saffron organza with mirror work and a matching dupatta.");
  await owner.getByLabel("Sangeet").check();
  await owner.getByLabel("3 days").fill("3200");
  await owner.getByLabel("What it cost new").fill("36000");
  await owner.getByLabel("Refundable deposit").fill("8000");
  await owner.getByLabel("Pickup address").selectOption({ index: 1 });
  await owner.getByLabel("Locality shown to renters").selectOption({ index: 1 });
  await owner.getByRole("button", { name: "Save and add photographs" }).click();
  await expect(owner).toHaveURL(/\/photos\?created=1/);
  await owner.waitForLoadState("networkidle");
  await owner
    .getByLabel("Choose photographs")
    .setInputFiles([fixture("outfit-front.jpg"), fixture("outfit-back.jpg"), fixture("outfit-detail.jpg")]);
  await expect(owner.getByRole("list", { name: "Photographs" }).getByRole("listitem")).toHaveCount(3, {
    timeout: 30_000,
  });
  await owner.getByRole("link", { name: "Continue to preview" }).click();
  await owner.getByRole("button", { name: "Submit for review" }).click();
  await expect(owner).toHaveURL(/\/lend\/dashboard\?done=submitted/);

  // Not visible to renters yet.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/explore?q=${encodeURIComponent(title)}`);
  await expect(visitor.getByRole("link", { name: new RegExp(title) })).toHaveCount(0);

  const admin = await signedIn(browser, "admin@peti.local");
  await admin.goto("/admin/listings?view=review");
  const row = admin.getByRole("listitem").filter({ has: admin.getByRole("link", { name: title }) });
  await row.getByRole("button", { name: "Approve and publish" }).click();
  await expect(admin.getByText(title)).toHaveCount(0); // gone from the queue

  await visitor.goto(`/explore?q=${encodeURIComponent(title)}`);
  await expect(visitor.getByRole("link", { name: new RegExp(title) }).first()).toBeVisible();
});

test("Journey 7: handover, confirmation, return and completion on a booking that starts today", async ({
  browser,
}) => {
  const b = booking("starts-today");
  const owner = await signedIn(browser, b.owner);
  const renter = await signedIn(browser, readyMadeBookings().renter);

  // The owner records the handover with photographs.
  await owner.goto(`/lend/requests/${b.bookingId}`);
  await owner.waitForLoadState("networkidle");
  await owner.getByLabel("Condition", { exact: true }).selectOption("EXCELLENT");
  await owner.getByLabel("Notes").fill("Pressed, all three pieces, no marks.");
  await owner
    .getByLabel(/Photographs \(at least/)
    .setInputFiles([fixture("outfit-front.jpg"), fixture("outfit-back.jpg"), fixture("outfit-detail.jpg")]);
  await owner.getByRole("button", { name: "Record handover" }).click();
  await expect(owner.getByRole("button", { name: "Record handover" })).toHaveCount(0, { timeout: 30_000 });

  // The renter is told, checks the report and confirms it.
  await renter.goto(`/account/rentals/${b.bookingId}`);
  await renter.getByRole("button", { name: "It matches — I have the outfit" }).click();
  await expect(renter.getByText("Handover confirmed. The rental has started.")).toBeVisible();

  // The owner records the return, then confirms it came back as it left.
  await owner.goto(`/lend/requests/${b.bookingId}`);
  await owner.waitForLoadState("networkidle");
  await owner.getByLabel("Condition", { exact: true }).selectOption("EXCELLENT");
  await owner.getByLabel("Notes").fill("Back on time, as it left.");
  await owner
    .getByLabel(/Photographs \(at least/)
    .setInputFiles([fixture("outfit-front.jpg"), fixture("outfit-back.jpg"), fixture("outfit-detail.jpg")]);
  await owner.getByRole("button", { name: "Record return" }).click();
  await expect(owner.getByRole("button", { name: "Confirm it is fine" })).toBeVisible({ timeout: 30_000 });
  await owner.getByRole("button", { name: "Confirm it is fine" }).click();
  await expect(owner.getByText(/Return confirmed and the rental is complete/)).toBeVisible();
  await expect(owner.getByText("Completed", { exact: true }).first()).toBeVisible();

  await renter.reload();
  await expect(renter.getByText("Completed", { exact: true }).first()).toBeVisible();
  await expect(renter.getByText(/Refund · deposit/)).toBeVisible();
});

test("Journeys 6 and 8: a declined payment, then payment, cancellation and the refund", async ({
  browser,
}) => {
  const b = booking("awaiting-payment");
  const renter = await signedIn(browser, readyMadeBookings().renter);
  const path = `/account/rentals/${b.bookingId}`;

  // A declined (simulated) payment takes nothing and leaves the booking payable.
  await renter.goto(path);
  await renter.getByRole("button", { name: /^Pay ₹.* \(simulated\)$/ }).click();
  await expect(renter).toHaveURL(/\/dev\/sandbox-checkout\//);
  await renter.waitForLoadState("networkidle");
  await renter.getByRole("button", { name: "Decline" }).click();
  await expect(renter).toHaveURL(new RegExp(`${path}\\?payment=failed`));
  await expect(renter.getByText("Payment failed")).toBeVisible();
  await expect(renter.getByText("Awaiting payment", { exact: true }).first()).toBeVisible();

  // Paying for real (in the sandbox) confirms it.
  await renter.getByRole("button", { name: /^Pay ₹.* \(simulated\)$/ }).click();
  await renter.waitForLoadState("networkidle");
  await renter.getByRole("button", { name: "Pay" }).first().click();
  await expect(renter.getByText("Payment received")).toBeVisible();

  // Cancelling well before the start refunds it; the refund is sent by the background jobs.
  await renter.getByText("Cancel this booking").click();
  await renter.getByRole("button", { name: "Cancel booking" }).click();
  await expect(renter.getByText(/Booking cancelled/)).toBeVisible();
  await expect(renter.getByText(/queued, sent with the next background run/).first()).toBeVisible();

  await runBackgroundJobs(renter);
  await renter.goto(path);
  await expect(renter.getByText(/queued, sent with the next background run/)).toHaveCount(0);
  await expect(renter.getByText(/sent to the payment provider|refunded/).first()).toBeVisible();
});

test("key pages have no serious or critical accessibility problems", async ({ browser }) => {
  const renter = await signedIn(browser, "rohan@peti.local");
  const anonymous = await (await browser.newContext()).newPage();
  const pages: Array<[Page, string]> = [
    [anonymous, "/"],
    [anonymous, "/explore"],
    [anonymous, "/sign-in"],
    [renter, "/account/rentals"],
    [renter, "/account"],
    [renter, "/lend/dashboard"],
  ];
  const first = await anonymous.request.get("/explore");
  expect(first.ok()).toBe(true);
  for (const [page, url] of pages) {
    await page.goto(url);
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    const serious = violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${url}: ${v.id} ${v.help} at ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
    expect(serious).toEqual([]);
  }
});
