import { describe, expect, it } from "vitest";
import { errorQuery, signedError } from "@/app/_lib/flash";

const secret = "a-test-secret-that-is-at-least-32-characters";
const parse = (q: string) => Object.fromEntries(new URLSearchParams(q));

describe("error messages carried in a redirect (#23)", () => {
  it("shows a message Peti signed", () => {
    const message = "A claim cannot exceed the deposit (less any late fee).";
    expect(signedError(parse(errorQuery(message, "error", secret)), "error", secret)).toBe(message);
  });

  it("ignores text from a crafted link", () => {
    expect(
      signedError({ error: "Your account is locked. Call +91 90000 00000." }, "error", secret),
    ).toBeUndefined();
    const signed = parse(errorQuery("Not submitted.", "error", secret));
    expect(signedError({ ...signed, error: "Call +91 90000 00000." }, "error", secret)).toBeUndefined();
    expect(signedError({ ...signed, errorSig: ["x", "y"] }, "error", secret)).toBeUndefined();
  });

  it("binds the signature to its parameter and secret", () => {
    const signed = parse(errorQuery("Saved items are full.", "saveError", secret));
    expect(signedError(signed, "saveError", secret)).toBe("Saved items are full.");
    expect(
      signedError({ error: signed.saveError, errorSig: signed.saveErrorSig }, "error", secret),
    ).toBeUndefined();
    expect(signedError(signed, "saveError", "another-secret-that-is-at-least-32-chars")).toBeUndefined();
  });
});
