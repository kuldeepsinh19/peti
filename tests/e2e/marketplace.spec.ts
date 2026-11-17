import path from "node:path";
import { type Browser, expect, type Page, test } from "@playwright/test";

/**
 * The two sides of the marketplace from the same kind of account (Phase 3):
 * Journey A — a member lists an outfit: details, photographs, cover, preview, submit, My outfits.
 * Journey B — a member explores, searches, opens an outfit, checks availability and requests it.
 */
const PASSWORD = "peti-demo-password";
const fixture = (name: string) => path.join(process.cwd(), "tests", "e2e", "fixtures", name);

async function signedIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account/);
  return page;
}

test("Journey A: list an outfit — details, photographs, cover, preview, submit, My outfits", async ({
  browser,
}) => {
  const owner = await signedIn(browser, "aarav@peti.local");
  const title = `Midnight velvet bandhgala ${Date.now().toString(36)}`;

  await owner.getByRole("link", { name: "List an outfit" }).first().click();
  await expect(owner).toHaveURL(/\/lend\/outfits\/new$/);
  await expect(owner.getByRole("navigation", { name: "Listing steps" })).toBeVisible();

  // Step 1: the essentials only.
  await owner.getByLabel("Outfit name").fill(title);
  await owner.getByLabel("Category").selectOption({ label: "Jodhpuri & bandhgala" });
  await owner.getByLabel("Size").selectOption("L");
  await owner
    .getByLabel("Description")
    .fill("Worn once at a reception. Navy velvet with a silk lining, comes with a pocket square.");
  await owner.getByLabel("Reception").check();
  await owner.getByLabel("3 days").fill("2800");
  await expect(owner.getByText(/you would receive/)).toContainText("₹2,380");
  await owner.getByLabel("What it cost new").fill("32000");
  await owner.getByLabel("Refundable deposit").fill("7000");
  await owner.getByLabel("Pickup address").selectOption({ index: 1 });
  await owner.getByLabel("Locality shown to renters").selectOption({ index: 1 });
  await owner.getByRole("button", { name: "Save and add photographs" }).click();

  // Step 2: photographs. Two are not enough to continue; the third (a listing needs three) is.
  await expect(owner).toHaveURL(/\/lend\/outfits\/[0-9a-f-]+\/photos\?created=1/);
  await expect(owner.getByText("Details saved as a draft")).toBeVisible();
  await owner.waitForLoadState("networkidle");
  await owner
    .getByLabel("Choose photographs")
    .setInputFiles([fixture("outfit-front.jpg"), fixture("outfit-detail.jpg")]);
  const photos = owner.getByRole("list", { name: "Photographs" }).getByRole("listitem");
  await expect(photos).toHaveCount(2, { timeout: 30_000 });
  await expect(owner.getByText("Add at least 3 photographs to continue (2 so far).")).toBeVisible();
  await expect(owner.getByRole("link", { name: "Continue to preview" })).toHaveCount(0);
  await owner.getByLabel("Choose photographs").setInputFiles(fixture("outfit-back.jpg"));
  await expect(photos).toHaveCount(3, { timeout: 30_000 });
  // The second photograph becomes the cover.
  const secondBefore = await photos.nth(1).getByRole("img").getAttribute("src");
  await owner.getByRole("button", { name: "Make photo 2 the cover" }).click();
  await expect(photos.first().getByRole("img")).toHaveAttribute("src", secondBefore!);
  await expect(photos.first()).toContainText("Cover");

  // Step 3: the preview renders the real card and outfit page.
  await owner.getByRole("link", { name: "Continue to preview" }).click();
  await expect(owner).toHaveURL(/\/preview$/);
  await expect(owner.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(owner.getByText("₹2,800").first()).toBeVisible();
  await owner.getByRole("button", { name: "Submit for review" }).click();

  // My outfits: submitted, pending approval, not yet visible to renters.
  await expect(owner).toHaveURL(/\/lend\/dashboard\?done=submitted/);
  await expect(owner.getByText("Submitted for review")).toBeVisible();
  const row = owner.getByRole("listitem").filter({ has: owner.getByRole("heading", { name: title }) });
  await expect(row.getByText("Pending approval")).toBeVisible();
  await expect(row.getByRole("button", { name: "Withdraw" })).toBeVisible();
});

test("Journey B: explore, search, open an outfit, check availability, request it", async ({ browser }) => {
  const renter = await signedIn(browser, "rohan@peti.local");

  await renter.getByRole("link", { name: "Explore outfits" }).first().click();
  await expect(renter).toHaveURL(/\/explore/);
  await expect(renter.getByRole("navigation", { name: "Categories" })).toBeVisible();
  await renter.getByLabel("Keyword").fill("antique");
  await renter.getByRole("button", { name: "Apply" }).click();
  await expect(renter).toHaveURL(/q=antique/);

  const card = renter.getByRole("link", { name: /Antique gold brocade sherwani/ }).first();
  await expect(card).toContainText(/Aarav Desai · /);
  await card.click();

  // The outfit page: gallery, availability, how renting works, the lender.
  await expect(
    renter.getByRole("heading", { level: 1, name: "Antique gold brocade sherwani" }),
  ).toBeVisible();
  await expect(renter.getByRole("heading", { name: "Availability" })).toBeVisible();
  await expect(renter.getByRole("heading", { name: "How renting works" })).toBeVisible();
  await expect(renter.getByText("Lent by")).toBeVisible();

  // Into the existing booking flow.
  await renter.getByRole("link", { name: "Choose your dates" }).click();
  // The outfit page has its own (read-only) calendar: wait for the request page before picking a day.
  await expect(renter).toHaveURL(/\/outfits\/[^/]+\/request$/);
  await expect(renter.getByRole("heading", { name: /Choose your/ })).toBeVisible();
  const days = renter.locator(".peti-calendar button.rdp-day_button:not([disabled])");
  for (let month = 0; month < 6 && (await days.count()) === 0; month++) {
    await renter.locator(".peti-calendar button.rdp-button_next").click();
  }
  await days.nth(Math.floor(Math.random() * Math.min(10, await days.count()))).click();
  await renter.getByLabel(/I accept the/).check();
  await renter.getByRole("button", { name: "Send request" }).click();
  await expect(renter).toHaveURL(/\/account\/rentals\/[0-9a-f-]+\?requested=1/);
  await expect(renter.getByText("Awaiting the owner").first()).toBeVisible();
});

test("an owner sees their own outfit without a request button", async ({ browser }) => {
  const owner = await signedIn(browser, "aarav@peti.local");
  await owner.goto("/explore?q=antique");
  await owner
    .getByRole("link", { name: /Antique gold brocade sherwani/ })
    .first()
    .click();
  await expect(owner.getByText("This is your outfit")).toBeVisible();
  await expect(owner.getByRole("link", { name: "Choose your dates" })).toHaveCount(0);
});
