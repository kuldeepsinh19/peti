"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { formatIndianMobile, normaliseIndianMobile, otpSchema } from "@/modules/users";
import { Button } from "@/shared/ui/button";
import { FormMessage, TextField } from "@/shared/ui/form";
import { authClient } from "./auth-client";

export function ResendVerificationEmail({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Button
        variant="secondary"
        size="sm"
        pending={state === "sending"}
        onClick={async () => {
          setState("sending");
          const { error } = await authClient.sendVerificationEmail({
            email,
            callbackURL: "/account?verified=1",
          });
          setState(error ? "error" : "sent");
        }}
      >
        Send the link again
      </Button>
      {state === "sent" ? <span className="text-sm text-success">Sent. Check your inbox.</span> : null}
      {state === "error" ? (
        <span className="text-sm text-danger">Could not send. Try again shortly.</span>
      ) : null}
    </div>
  );
}

/** Two steps: send a one-time code by SMS, then confirm it. Better Auth stores the verified number. */
export function PhoneVerification({ currentNumber }: { currentNumber: string | null }) {
  const router = useRouter();
  const [phone, setPhone] = useState(currentNumber ? formatIndianMobile(currentNumber) : "");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const otp = useForm<z.input<typeof otpSchema>>({
    resolver: zodResolver(otpSchema),
    defaultValues: { code: "" },
  });

  async function sendCode() {
    setError(null);
    const normalised = normaliseIndianMobile(phone);
    if (!normalised) {
      setError("Enter a 10-digit Indian mobile number.");
      return;
    }
    setBusy(true);
    const { error: sendError } = await authClient.phoneNumber.sendOtp({ phoneNumber: normalised });
    setBusy(false);
    if (sendError) {
      setError(
        sendError.status === 429
          ? "Too many codes requested. Try again in a few minutes."
          : "We could not send a code to that number.",
      );
      return;
    }
    setSentTo(normalised);
  }

  const verify = otp.handleSubmit(async ({ code }) => {
    if (!sentTo) return;
    setError(null);
    const { error: verifyError } = await authClient.phoneNumber.verify({
      phoneNumber: sentTo,
      code,
      updatePhoneNumber: true,
    });
    if (verifyError) {
      setError(
        verifyError.code === "PHONE_NUMBER_EXIST"
          ? "That number is already verified on another account."
          : "That code is not right, or it has expired.",
      );
      return;
    }
    router.refresh();
  });

  return (
    <div className="grid max-w-md gap-5">
      <FormMessage>{error}</FormMessage>
      {sentTo ? (
        <form onSubmit={verify} noValidate className="grid gap-5">
          <p className="text-sm text-graphite">We sent a 6-digit code to {formatIndianMobile(sentTo)}.</p>
          <TextField
            label="Verification code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            {...otp.register("code")}
            error={otp.formState.errors.code?.message}
          />
          <div className="flex gap-3">
            <Button type="submit" pending={otp.formState.isSubmitting}>
              Verify number
            </Button>
            <Button variant="quiet" onClick={() => setSentTo(null)}>
              Use a different number
            </Button>
          </div>
        </form>
      ) : (
        <div className="grid gap-5">
          <TextField
            label="Mobile number"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            prefix="+91"
            value={phone.replace(/^\+91\s?/, "")}
            onChange={(e) => setPhone(e.target.value)}
            hint="Shown to the other person only after a booking is confirmed and paid."
          />
          <div>
            <Button onClick={sendCode} pending={busy}>
              Send code
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
