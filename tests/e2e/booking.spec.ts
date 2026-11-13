import { type Browser, expect, type Page, test } from "@playwright/test";

const PASSWORD = "peti-demo-password";

async function signedInPage(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account/);
  return page;
}

test("rent an outfit: request, approval, sandbox payment, confirmation", async ({ browser }) => {
  // Seeded demo data: Aarav owns "Antique gold brocade sherwani"; Rohan rents.
  const renter = await signedInPage(browser, "rohan@peti.local");
  await renter.goto("/explore?q=antique");
  await renter
    .getByRole("link", { name: /Antique gold brocade sherwani/ })
    .first()
    .click();
  await renter.getByRole("link", { name: "Choose your dates" }).click();
  await expect(renter.getByRole("heading", { name: /Choose your/ })).toBeVisible();

  // A random selectable day (held dates are disabled). Earlier runs against the same database hold dates,
  // so move on a month at a time until one has free days.
  const days = renter.locator(".peti-calendar button.rdp-day_button:not([disabled])");
  for (let month = 0; month < 6 && (await days.count()) === 0; month++) {
    await renter.locator(".peti-calendar button.rdp-button_next").click();
  }
  await days.nth(Math.floor(Math.random() * Math.min(10, await days.count()))).click();
  await renter.getByLabel(/I accept the/).check();
  await renter.getByRole("button", { name: "Send request" }).click();
  await expect(renter).toHaveURL(/\/account\/rentals\/[0-9a-f-]+\?requested=1/);
  await expect(renter.getByText("Awaiting the owner").first()).toBeVisible();
  const bookingPath = new URL(renter.url()).pathname;
  const bookingId = bookingPath.split("/").pop()!;

  // Contact details stay hidden before payment.
  await expect(
    renter.getByText(/Contact details and the pickup address are shared once the booking is paid/),
  ).toBeVisible();

  const owner = await signedInPage(browser, "aarav@peti.local");
  await owner.goto("/lend/requests");
  await owner.goto(`/lend/requests/${bookingId}`);
  await owner.getByRole("button", { name: "Approve request" }).click();
  await expect(owner.getByText("Awaiting payment").first()).toBeVisible();

  await renter.goto(bookingPath);
  await renter.getByRole("button", { name: /^Pay ₹/ }).click();
  await expect(renter).toHaveURL(/\/dev\/sandbox-checkout\//);
  await renter.getByRole("button", { name: "Pay" }).first().click();
  await expect(renter).toHaveURL(new RegExp(`/account/rentals/${bookingId}\\?payment=`));
  await expect(renter.getByText("Payment received")).toBeVisible();
  await expect(renter.getByText("Confirmed", { exact: true }).first()).toBeVisible();
  await expect(renter.getByRole("link", { name: /^\+91/ })).toBeVisible(); // owner's mobile, now shared

  await owner.reload();
  await expect(owner.getByText("Confirmed", { exact: true }).first()).toBeVisible();
});

test("another member cannot open someone else's booking", async ({ browser }) => {
  const renter = await signedInPage(browser, "rohan@peti.local");
  await renter.goto("/account/rentals");
  const first = renter.locator("a[href^='/account/rentals/']").first();
  test.skip((await first.count()) === 0, "needs a booking from the previous test");
  const href = await first.getAttribute("href");
  const stranger = await signedInPage(browser, "isha@peti.local");
  const response = await stranger.goto(href!);
  expect(response?.status()).toBe(404);
});

test("non-admins cannot reach administration", async ({ browser }) => {
  const member = await signedInPage(browser, "isha@peti.local");
  const response = await member.goto("/admin/listings");
  expect(response?.status()).toBe(404);
});
