import { describe, expect, it } from "vitest";
import { demoAccounts, localSeedAccounts } from "@/config/site";
import { demoPassword, users } from "../../../prisma/seed-data";

describe("accounts shown on the sign-in page", () => {
  it("lists exactly the seeded accounts locally, with the seeded password", () => {
    expect(localSeedAccounts.accounts.map((a) => a.email).sort()).toEqual(users.map((u) => u.email).sort());
    expect(localSeedAccounts.password).toBe(demoPassword);
  });

  it("never offers the administrator on the public demo", () => {
    const admins = users.filter((u) => u.role === "admin").map((u) => u.email);
    for (const a of demoAccounts.accounts) expect(admins).not.toContain(a.email);
  });
});
