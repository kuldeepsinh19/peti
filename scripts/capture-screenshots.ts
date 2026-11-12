/**
 * Captures the README screenshots from a running, seeded instance.
 *   pnpm build && pnpm start --port 3100     (in another terminal, APP_ENV=test or local)
 *   pnpm docs:screenshots                    (BASE_URL defaults to http://localhost:3100)
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import sharp from "sharp";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = path.resolve(import.meta.dirname, "../docs/screenshots");

async function shot(page: Page, name: string) {
  // Scroll through once so lazy images load, then return to the top.
  for (let y = 0; y < 4000; y += 500) {
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(80);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  const png = await page.screenshot();
  await sharp(png)
    .jpeg({ quality: 76, mozjpeg: true })
    .toFile(path.join(OUT, `${name}.jpg`));
  console.log("captured", name);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await desktop.goto(`${BASE}/`);
  await shot(desktop, "home-desktop");
  await desktop.goto(`${BASE}/explore`);
  await shot(desktop, "explore-desktop");
  await desktop.goto(`${BASE}/explore?q=antique`);
  await desktop
    .getByRole("link", { name: /Antique gold brocade sherwani/ })
    .first()
    .click();
  await desktop.waitForLoadState("load");
  await shot(desktop, "outfit-desktop");

  await desktop.goto(`${BASE}/sign-in`);
  await desktop.getByLabel("Email").fill("rohan@peti.local");
  await desktop.getByLabel("Password").fill("peti-demo-password");
  await desktop.getByRole("button", { name: "Sign in" }).click();
  await desktop.waitForURL(/\/account/);
  await desktop.goto(`${BASE}/account/rentals`);
  const booking = desktop.locator("a[href^='/account/rentals/']").first();
  if (await booking.count()) {
    await booking.click();
    await desktop.waitForLoadState("load");
    await shot(desktop, "booking-desktop");
  }

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await mobile.goto(`${BASE}/`);
  await shot(mobile, "home-mobile");

  await browser.close();
}

await main();
