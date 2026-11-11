import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "link" | "danger" | "inverse";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-sans font-medium tracking-[0.04em] transition-colors duration-150 select-none disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-burgundy text-paper hover:bg-burgundy-light",
  secondary: "border border-ink text-ink hover:bg-ink hover:text-paper",
  quiet: "text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-ink",
  link: "p-0 text-burgundy underline underline-offset-4 hover:text-burgundy-light",
  danger: "border border-danger text-danger hover:bg-danger hover:text-paper",
  inverse: "bg-paper text-ink hover:bg-sand",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-caption",
  md: "h-11 px-6 text-sm",
  lg: "h-14 px-8 text-[0.9375rem]",
};

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
) {
  return cn(
    base,
    variants[variant],
    variant === "link" || variant === "quiet" ? "h-auto" : sizes[size],
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pending?: boolean;
}

export function Button({
  variant,
  size,
  pending,
  className,
  children,
  disabled,
  type,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...rest}
    >
      {pending ? <Spinner /> : null}
      {children}
    </button>
  );
}

export type ButtonLinkProps = Omit<ComponentProps<typeof Link>, "className" | "children"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
};

export function ButtonLink({ variant, size, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}

function Spinner() {
  return <span aria-hidden className="size-3 animate-spin border border-current border-t-transparent" />;
}
