/**
 * Captures the README and report screenshots from a running, seeded instance.
 *   pnpm build && pnpm start --port 3100     (in another terminal, APP_ENV=test or local)
 *   pnpm docs:screenshots                    (BASE_URL defaults to http://localhost:3100)
 *
 * The owner screens use the seeded owner's first outfit; nothing is created or changed.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { type Browser, chromium, type Page } from "@playwright/test";
import sharp from "sharp";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = path.resolve(import.meta.dirname, "../docs/screenshots");
const PASSWORD = "peti-demo-password";

async function save(page: Page, name: string) {
  await sharp(await page.screenshot())
    .jpeg({ quality: 76, mozjpeg: true })
    .toFile(path.join(OUT, `${name}.jpg`));
  console.log("captured", name);
}

async function shot(page: Page, name: string) {
  await page.waitForLoadState("networkidle");
  // Scroll through once so lazy images load, then return to the top.
  for (let y = 0; y < 4000; y += 500) {
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(80);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  await save(page, name);
}

async function signedIn(
  browser: Browser,
  email: string,
  viewport: { width: number; height: number },
  scale = 1,
) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: scale });
  await page.goto(`${BASE}/sign-in`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/account/);
  return page;
}

async function openAntiqueSherwani(page: Page) {
  await page.goto(`${BASE}/explore?q=antique`);
  await page
    .getByRole("link", { name: /Antique gold brocade sherwani/ })
    .first()
    .click();
  await page.waitForURL(/\/outfits\//);
}

/** The seeded owner's screens: My outfits and the three listing steps for their first outfit. */
async function ownerScreens(page: Page, suffix: string) {
  await page.goto(`${BASE}/lend/dashboard`);
  await shot(page, `my-outfits-${suffix}`);
  const preview = await page
    .getByRole("link", { name: /^Preview / })
    .first()
    .getAttribute("href");
  const id = preview?.split("/")[3];
  await page.goto(`${BASE}/lend/outfits/new`);
  await shot(page, `list-details-${suffix}`);
  if (id) {
    await page.goto(`${BASE}/lend/outfits/${id}/photos`);
    await shot(page, `list-photos-${suffix}`);
    await page.goto(`${BASE}/lend/outfits/${id}/preview`);
    await shot(page, `list-preview-${suffix}`);
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const desktopSize = { width: 1440, height: 900 };
  const mobileSize = { width: 390, height: 844 };

  const desktop = await browser.newPage({ viewport: desktopSize });
  await desktop.goto(`${BASE}/`);
  await shot(desktop, "home-desktop");
  await desktop.goto(`${BASE}/explore`);
  await shot(desktop, "explore-desktop");
  await openAntiqueSherwani(desktop);
  await shot(desktop, "outfit-desktop");
  await desktop.getByRole("heading", { name: "Availability" }).scrollIntoViewIfNeeded();
  await desktop.waitForTimeout(400);
  await save(desktop, "outfit-availability-desktop");

  const renter = await signedIn(browser, "rohan@peti.local", desktopSize);
  await renter.goto(`${BASE}/account/rentals`);
  const booking = renter.locator("a[href^='/account/rentals/']").first();
  if (await booking.count()) {
    await booking.click();
    await renter.waitForLoadState("load");
    await shot(renter, "booking-desktop");
  }

  await ownerScreens(await signedIn(browser, "aarav@peti.local", desktopSize), "desktop");

  const mobile = await browser.newPage({ viewport: mobileSize, deviceScaleFactor: 2 });
  await mobile.goto(`${BASE}/`);
  await shot(mobile, "home-mobile");
  await mobile.goto(`${BASE}/explore`);
  await shot(mobile, "explore-mobile");
  await openAntiqueSherwani(mobile);
  await shot(mobile, "outfit-mobile");
  await ownerScreens(await signedIn(browser, "aarav@peti.local", mobileSize, 2), "mobile");

  await browser.close();
}

await main();
