import { describe, expect, it, vi } from "vitest";
import {
  MSG91_FLOW_URL,
  SmsDeliveryError,
  msg91SmsSender,
} from "@/modules/notifications/infrastructure/msg91-sms-sender";

/**
 * The MSG91 adapter against a stubbed fetch. It pins the request the official documentation describes
 * (https://docs.msg91.com/sms/send-sms); it does not prove MSG91 accepts it — that needs real credentials.
 */
const AUTH_KEY = "authkey-0123456789-secret";
const CODE = "482913";
const NUMBER = "+919876543210";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function sender(respond: (url: string, init: RequestInit) => Promise<Response> | Response) {
  const fetchStub = vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
    respond(String(url), init ?? {}),
  );
  const sms = msg91SmsSender({
    authKey: AUTH_KEY,
    otpTemplateId: "tpl_otp_1",
    otpVariable: "OTP",
    timeoutMs: 50,
    fetch: fetchStub as unknown as typeof fetch,
  });
  return { sms, fetchStub };
}

const send = (sms: ReturnType<typeof sender>["sms"], to = NUMBER) =>
  sms.sendOtp(to, { code: CODE, expiresInMinutes: 5 });

describe("MSG91 SMS adapter", () => {
  it("posts the template id and the code as a template variable, with the key in a header", async () => {
    const { sms, fetchStub } = sender(() => json({ type: "success", message: "3763646c3058373530393938" }));
    await send(sms);

    expect(fetchStub).toHaveBeenCalledTimes(1);
    const [url, init] = fetchStub.mock.calls[0]!;
    expect(url).toBe(MSG91_FLOW_URL);
    expect(url).toBe("https://control.msg91.com/api/v5/flow");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      accept: "application/json",
      "content-type": "application/json",
      authkey: AUTH_KEY,
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      template_id: "tpl_otp_1",
      short_url: "0",
      realTimeResponse: "1",
      recipients: [{ mobiles: "919876543210", OTP: CODE }],
    });
    // Nothing secret in the URL.
    expect(String(url)).not.toContain(AUTH_KEY);
    expect(String(url)).not.toContain(CODE);
  });

  it("accepts the success shape the documentation shows under data", async () => {
    const { sms } = sender(() => json({ data: { type: "success", message: "5e1e93cad6fc054d8e759a5b" } }));
    await expect(send(sms)).resolves.toBeUndefined();
  });

  it("treats HTTP 200 with type error as a failure", async () => {
    const { sms } = sender(() =>
      json({ type: "error", message: "The provided flow ID or template ID is invalid." }),
    );
    await expect(send(sms)).rejects.toThrow(
      "MSG91 refused the message (HTTP 200): The provided flow ID or template ID is invalid.",
    );
  });

  it("fails on an error status, a body that is not JSON, and a missing verdict", async () => {
    await expect(
      send(sender(() => json({ type: "error", message: "Auth Key missing" }, 401)).sms),
    ).rejects.toThrow("HTTP 401");
    await expect(
      send(sender(() => new Response("<html>Bad gateway</html>", { status: 502 })).sms),
    ).rejects.toThrow("HTTP 502");
    await expect(send(sender(() => json({})).sms)).rejects.toBeInstanceOf(SmsDeliveryError);
  });

  it("never puts the key, the number or the code in an error", async () => {
    const leaky = sender(() =>
      json({ type: "error", message: `Invalid mobile 919876543210 for otp ${CODE} key ${AUTH_KEY}` }, 400),
    );
    const error = (await send(leaky.sms).catch((e: unknown) => e)) as Error;
    expect(error).toBeInstanceOf(SmsDeliveryError);
    expect(error.message).not.toContain("9876543210");
    expect(error.message).not.toContain(CODE);
    expect(error.message).not.toContain("0123456789");

    const unreachable = sender(() => {
      throw new Error(`connect ECONNREFUSED authkey=${AUTH_KEY}`);
    });
    await expect(send(unreachable.sms)).rejects.toThrow("MSG91 could not be reached.");
  });

  it("gives up when the provider does not answer in time", async () => {
    const { sms } = sender(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    await expect(send(sms)).rejects.toThrow("MSG91 did not answer in time.");
  });

  it("refuses anything but an Indian mobile number without calling the provider", async () => {
    const { sms, fetchStub } = sender(() => json({ type: "success" }));
    for (const to of ["+14155550123", "9876543210", "+91123456789", "+9198765432100"]) {
      await expect(send(sms, to)).rejects.toThrow("Not an Indian mobile number.");
    }
    expect(fetchStub).not.toHaveBeenCalled();
  });
});
