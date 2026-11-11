import { expect, type Page, test } from "@playwright/test";

/** Reads the newest dev-outbox message for a recipient (local/test only). */
async function latestOutboxBody(page: Page, recipient: string): Promise<string> {
  await page.goto("/dev/outbox");
  const message = page.getByTestId("outbox-message").filter({ hasText: recipient }).first();
  await expect(message).toBeVisible();
  return (await message.getByTestId("outbox-body").textContent()) ?? "";
}

test("sign up, confirm email, verify phone, sign out and sign back in @mobile", async ({ page }) => {
  const stamp = Date.now().toString(36);
  const email = `e2e-${stamp}@example.test`;
  const password = "a-long-test-password";
  const phone = `9${String(Date.now()).slice(-9)}`;

  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Esha Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByLabel(/I am 18 or older/).check();
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/account\?welcome=1/);
  await expect(page.getByText("Your account is ready")).toBeVisible();
  await expect(page.getByText("Not confirmed")).toBeVisible();

  // Email confirmation through the link that was "sent".
  const body = await latestOutboxBody(page, email);
  const link = /https?:\/\/\S+verify-email\S+/.exec(body)?.[0];
  expect(link).toBeTruthy();
  await page.goto(new URL(link!).pathname + new URL(link!).search);
  await expect(page).toHaveURL(/\/account/);
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();

  // Phone verification: read the one-time code from the outbox in a second tab, keeping the form open.
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("Verification code")).toBeVisible();
  const outbox = await page.context().newPage();
  const sms = await latestOutboxBody(outbox, `+91${phone}`);
  await outbox.close();
  const code = /(\d{6}) is your Peti verification code/.exec(sms)?.[1];
  expect(code).toBeTruthy();
  await page.getByLabel("Verification code").fill(code!);
  await page.getByRole("button", { name: "Verify number" }).click();
  await expect(page.getByText("Verified by code")).toBeVisible();
  await expect(page.getByText("Not verified — Peti does not check ID documents")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account$/);
});

test("signed-out visitors are sent to sign in from protected areas", async ({ page }) => {
  await page.goto("/account/addresses");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Faccount%2Faddresses/);
});

test("wrong password shows a generic error", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("aarav@peti.local");
  await page.getByLabel("Password").fill("definitely-wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That email and password do not match.")).toBeVisible();
});

test("password reset through the emailed link", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill("rohan@peti.local");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/If an account exists/)).toBeVisible();

  const body = await latestOutboxBody(page, "rohan@peti.local");
  const link = /https?:\/\/\S+reset-password\S+/.exec(body)?.[0];
  expect(link).toBeTruthy();
  await page.goto(new URL(link!).pathname + new URL(link!).search);
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  // Reset to the same demo password so other specs keep working.
  await page.getByLabel("New password", { exact: true }).fill("peti-demo-password");
  await page.getByLabel("Repeat the new password").fill("peti-demo-password");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page).toHaveURL(/\/sign-in\?reset=1/);
});
