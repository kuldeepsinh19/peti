import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { isDevToolingEnabled } from "@/config/env";

// Development tooling (design system, dev outbox, sandbox checkout) does not exist outside local/test.
export const dynamic = "force-dynamic";

export default function DevLayout({ children }: { children: ReactNode }) {
  if (!isDevToolingEnabled()) notFound();
  return (
    <div>
      <p className="bg-olive-deep px-4 py-2 text-center eyebrow text-paper">
        Development tooling — not available in production
      </p>
      {children}
    </div>
  );
}
