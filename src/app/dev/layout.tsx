import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { allowsSandboxPayments, isDevToolingEnabled } from "@/config/env";

// Development tooling (design system, dev outbox) exists only in local/test, the sandbox checkout also in
// the public demo. Each page checks its own capability too.
export const dynamic = "force-dynamic";

export default function DevLayout({ children }: { children: ReactNode }) {
  if (!isDevToolingEnabled() && !allowsSandboxPayments()) notFound();
  return (
    <div>
      <p className="bg-olive-deep px-4 py-2 text-center eyebrow text-paper">
        {isDevToolingEnabled()
          ? "Development tooling — not available in production"
          : "Demonstration — no real payments"}
      </p>
      {children}
    </div>
  );
}
