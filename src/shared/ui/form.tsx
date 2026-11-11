import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "./cn";

/*
 * Editorial form controls: a small-caps label above a single bottom rule, no boxes, no rounded corners.
 * Every control gets its label, hint and error wired up with ids so screen readers announce them.
 */

const control =
  "block w-full border-0 border-b border-rule-strong bg-transparent px-0 py-2.5 text-base text-ink placeholder:text-stone transition-colors focus:border-ink focus:outline-none focus-visible:outline-none aria-[invalid=true]:border-danger disabled:opacity-50";

interface FieldShellProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  optional?: boolean;
  className?: string;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

export function FieldShell({ label, hint, error, optional, className, children }: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="flex items-baseline justify-between eyebrow text-graphite">
        <span>{label}</span>
        {optional ? <span className="tracking-normal text-stone normal-case">optional</span> : null}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint ? (
        <p id={hintId} className="text-caption text-stone">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-caption text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type Common = { label: ReactNode; hint?: ReactNode; error?: string | undefined; optional?: boolean };

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "prefix">, Common {
  containerClassName?: string;
  prefix?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, optional, className, containerClassName, prefix, ...rest },
  ref,
) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional} className={containerClassName}>
      {({ id, describedBy, invalid }) =>
        prefix ? (
          <div className="flex items-baseline gap-2">
            <span className="text-graphite">{prefix}</span>
            <input
              ref={ref}
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              className={cn(control, className)}
              {...rest}
            />
          </div>
        ) : (
          <input
            ref={ref}
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className={cn(control, className)}
            {...rest}
          />
        )
      }
    </FieldShell>
  );
});

export interface TextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id">, Common {
  containerClassName?: string;
}

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(function TextAreaField(
  { label, hint, error, optional, className, containerClassName, rows = 4, ...rest },
  ref,
) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional} className={containerClassName}>
      {({ id, describedBy, invalid }) => (
        <textarea
          ref={ref}
          id={id}
          rows={rows}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn(control, "resize-y leading-relaxed", className)}
          {...rest}
        />
      )}
    </FieldShell>
  );
});

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id">, Common {
  containerClassName?: string;
  options: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, hint, error, optional, className, containerClassName, options, placeholder, ...rest },
  ref,
) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional} className={containerClassName}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <select
            ref={ref}
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className={cn(control, "appearance-none pr-6", className)}
            {...rest}
          >
            {placeholder ? <option value="">{placeholder}</option> : null}
            {options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))}
          </select>
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-0 -translate-y-1/2 text-graphite"
          >
            ▾
          </span>
        </div>
      )}
    </FieldShell>
  );
});

export interface CheckboxFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> {
  label: ReactNode;
  error?: string | undefined;
}

export const CheckboxField = forwardRef<HTMLInputElement, CheckboxFieldProps>(function CheckboxField(
  { label, error, className, ...rest },
  ref,
) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-ink">
        <input
          ref={ref}
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-0.5 size-4 shrink-0 cursor-pointer appearance-none border border-ink bg-paper checked:bg-burgundy checked:shadow-[inset_0_0_0_3px_var(--color-paper)] focus-visible:outline-2"
          {...rest}
        />
        <span>{label}</span>
      </label>
      {error ? (
        <p id={`${id}-error`} className="text-caption text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
});

export function Fieldset({
  legend,
  description,
  children,
  className,
}: {
  legend: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("grid gap-6 border-t border-rule pt-6", className)}>
      <legend className="float-left mb-2 w-full font-display text-2xl">{legend}</legend>
      {description ? <p className="-mt-4 max-w-prose text-sm text-graphite">{description}</p> : null}
      {children}
    </fieldset>
  );
}

/** Top-of-form summary for errors that do not belong to a single field. */
export function FormMessage({
  tone = "error",
  children,
}: {
  tone?: "error" | "success";
  children: ReactNode;
}) {
  if (!children) return null;
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "border-l-2 py-1 pl-3 text-sm",
        tone === "error" ? "border-danger text-danger" : "border-success text-success",
      )}
    >
      {children}
    </p>
  );
}
