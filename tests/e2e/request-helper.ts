import { expect, type Page } from "@playwright/test";

/**
 * On the request page: picks a free start day and sends the request. Runs against a long-lived local database
 * leave the renter's earlier requests waiting, and the same outfit and start day cannot be requested twice,
 * so another day is tried when that is the refusal.
 */
export async function requestSomeFreeDay(page: Page) {
  const days = page.locator(".peti-calendar button.rdp-day_button:not([disabled])");
  for (let month = 0; month < 6 && (await days.count()) === 0; month++) {
    await page.locator(".peti-calendar button.rdp-button_next").click();
  }
  // Spread runs over the next months rather than always the first free days.
  const ahead = Math.floor(Math.random() * 5);
  for (let month = 0; month < ahead; month++) {
    await page.locator(".peti-calendar button.rdp-button_next").click();
    if ((await days.count()) === 0) {
      await page.locator(".peti-calendar button.rdp-button_previous").click();
      break;
    }
  }
  await page.getByLabel(/I accept the/).check();
  // Days not already chosen: clicking the selected day again would clear the choice.
  const unchosen = page.locator(
    ".peti-calendar td:not([aria-selected='true']):not([data-selected='true']) button.rdp-day_button:not([disabled])",
  );
  for (let attempt = 0; attempt < 8; attempt++) {
    await unchosen.nth(Math.floor(Math.random() * (await unchosen.count()))).click();
    await page.getByRole("button", { name: "Send request" }).click();
    const sent = await page.waitForURL(/\?requested=1/, { timeout: 5_000 }).then(
      () => true,
      () => false,
    );
    if (sent) return;
    // Any other refusal (the hourly request limit after many runs, for example) fails with its message.
    const refusal = (await page.getByRole("alert").allInnerTexts()).join(" ");
    expect(refusal).toMatch(/already have a request waiting/);
    // A month can have only a few free start days, all already requested: try the next month.
    await page.locator(".peti-calendar button.rdp-button_next").click();
    if ((await unchosen.count()) === 0)
      await page.locator(".peti-calendar button.rdp-button_previous").click();
  }
  throw new Error("Every day tried already had a waiting request from this renter.");
}
