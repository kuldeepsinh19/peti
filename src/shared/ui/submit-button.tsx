"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "./button";

/**
 * A submit button for server-rendered forms that post to a Server Action: it shows a spinner and stays
 * disabled while its form is submitting, so a double click cannot send the command twice.
 */
export function SubmitButton(props: Omit<ButtonProps, "type" | "pending">) {
  const { pending } = useFormStatus();
  return <Button {...props} type="submit" pending={pending} />;
}
