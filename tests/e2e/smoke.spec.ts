import { expect, test } from "@playwright/test";

test("home page renders @mobile", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("health endpoint responds", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
});

test("a missing outfit is a real 404 with the branded page", async ({ page }) => {
  const response = await page.goto("/outfits/no-such-outfit-anywhere");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Not here.");
});
