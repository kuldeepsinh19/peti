"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { signInSchema, signUpSchema } from "@/modules/users";
import { Button } from "@/shared/ui/button";
import { CheckboxField, FormMessage, TextField } from "@/shared/ui/form";
import { authClient } from "./auth-client";

/** Only allow same-site relative redirects after sign-in (no open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/account"): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}

type SignUpValues = z.input<typeof signUpSchema>;

export function SignUpForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const { error } = await authClient.signUp.email({
      name: values.name.trim(),
      email: values.email.trim().toLowerCase(),
      password: values.password,
      callbackURL: "/account?verified=1",
    });
    if (error) {
      setFormError(
        error.code === "USER_ALREADY_EXISTS" || error.status === 422
          ? "An account with this email already exists. Try signing in."
          : (error.message ?? "We could not create your account."),
      );
      return;
    }
    router.push("/account?welcome=1");
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-7">
      <FormMessage>{formError}</FormMessage>
      <TextField
        label="Your name"
        autoComplete="name"
        {...form.register("name")}
        error={errors.name?.message}
      />
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        {...form.register("email")}
        error={errors.email?.message}
      />
      <TextField
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters."
        {...form.register("password")}
        error={errors.password?.message}
      />
      <CheckboxField
        label={
          <>
            I am 18 or older and accept the <Link href="/terms">terms</Link> and{" "}
            <Link href="/privacy">privacy notice</Link>.
          </>
        }
        {...form.register("acceptTerms")}
        error={errors.acceptTerms?.message}
      />
      <Button type="submit" size="lg" pending={isSubmitting}>
        Create account
      </Button>
    </form>
  );
}

type SignInValues = z.input<typeof signInSchema>;

export function SignInForm({ next }: { next?: string | undefined }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const { error } = await authClient.signIn.email({ email: values.email, password: values.password });
    if (error) {
      setFormError(
        error.status === 429
          ? "Too many attempts. Please wait a minute and try again."
          : error.code === "BANNED_USER"
            ? "This account has been suspended. Contact the administrators if you think this is a mistake."
            : "That email and password do not match.",
      );
      return;
    }
    router.push(safeNext(next));
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-7">
      <FormMessage>{formError}</FormMessage>
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        {...form.register("email")}
        error={errors.email?.message}
      />
      <TextField
        label="Password"
        type="password"
        autoComplete="current-password"
        {...form.register("password")}
        error={errors.password?.message}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button type="submit" size="lg" pending={isSubmitting}>
          Sign in
        </Button>
        <Link href="/forgot-password" className="text-sm text-burgundy">
          Forgotten your password?
        </Link>
      </div>
    </form>
  );
}

const forgotSchema = z.object({ email: z.email("Enter a valid email address.").trim().toLowerCase() });

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const form = useForm<z.input<typeof forgotSchema>>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ email }) => {
    // The response is the same whether or not the account exists, so this cannot be used to find users.
    await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setSent(true);
  });

  if (sent) {
    return (
      <FormMessage tone="success">
        If an account exists for that address, we have sent a link to reset its password. It expires in one
        hour.
      </FormMessage>
    );
  }
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-7">
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        {...form.register("email")}
        error={errors.email?.message}
      />
      <Button type="submit" size="lg" pending={isSubmitting}>
        Send reset link
      </Button>
    </form>
  );
}

const resetSchema = z
  .object({
    password: z.string().min(10, "Use at least 10 characters.").max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords do not match." });

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", confirm: "" },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ password }) => {
    setFormError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error) {
      setFormError("This reset link has expired or was already used. Please request a new one.");
      return;
    }
    router.push("/sign-in?reset=1");
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-7">
      <FormMessage>{formError}</FormMessage>
      <TextField
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters."
        {...form.register("password")}
        error={errors.password?.message}
      />
      <TextField
        label="Repeat the new password"
        type="password"
        autoComplete="new-password"
        {...form.register("confirm")}
        error={errors.confirm?.message}
      />
      <Button type="submit" size="lg" pending={isSubmitting}>
        Set new password
      </Button>
    </form>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="quiet"
      pending={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        router.push("/");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
