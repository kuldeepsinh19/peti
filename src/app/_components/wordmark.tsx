import Link from "next/link";
import { site } from "@/config/site";
import { cn } from "@/shared/ui/cn";

export function Wordmark({ size = "md", className }: { size?: "md" | "lg"; className?: string }) {
  return (
    <Link
      href="/"
      className={cn("group inline-flex items-baseline gap-2 no-underline", className)}
      aria-label="Peti home"
    >
      <span
        className={cn(
          "font-display leading-none tracking-tight text-ink",
          size === "lg" ? "text-[clamp(5rem,18vw,16rem)]" : "text-[2rem]",
        )}
      >
        Peti
      </span>
      <span
        lang="gu"
        className={cn(
          "font-gujarati text-burgundy",
          size === "lg" ? "text-[clamp(1.5rem,4vw,3rem)]" : "text-base",
        )}
      >
        {site.nameGujarati}
      </span>
    </Link>
  );
}
