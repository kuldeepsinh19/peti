import "server-only";
import type { SmsSender } from "../application/ports";

/**
 * MSG91 adapter for verification codes, using the Send SMS (Flow) API:
 *   POST https://control.msg91.com/api/v5/flow   (https://docs.msg91.com/sms/send-sms)
 *   headers: authkey, content-type: application/json
 *   body:    { template_id, recipients: [{ mobiles: "91XXXXXXXXXX", <variable>: <value> }] }
 *
 * STATUS: implemented from the official documentation and unit-tested against a stubbed `fetch`. It has
 * NEVER been run against MSG91: no account, DLT registration or credentials exist yet. Verify it in a
 * staging environment before relying on it (docs/development/sms-otp.md).
 *
 * The message text is not sent from here. Indian DLT rules require an approved template; MSG91 fills its
 * variable with the code. The template must state the same expiry as the application (5 minutes).
 */
export interface Msg91Config {
  authKey: string;
  /** MSG91 template (flow) id of the DLT-approved verification template. */
  otpTemplateId: string;
  /** Name of the template variable that receives the code, without the ## markers. */
  otpVariable: string;
  timeoutMs?: number;
  /** For tests. */
  fetch?: typeof fetch;
}

export const MSG91_FLOW_URL = "https://control.msg91.com/api/v5/flow";

/**
 * Why an SMS was not handed to the provider. The message never contains the auth key, the phone number or
 * the code, so it is safe to log.
 */
export class SmsDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmsDeliveryError";
  }
}

/** Provider text is useful to an operator, but may echo the number: long digit runs are masked. */
const safe = (text: unknown) =>
  typeof text === "string" ? text.replace(/\d{6,}/g, "[digits]").slice(0, 200) : "no reason given";

export function msg91SmsSender(config: Msg91Config): SmsSender {
  const send = config.fetch ?? fetch;
  const timeoutMs = config.timeoutMs ?? 10_000;
  return {
    async sendOtp(to, otp) {
      // MSG91 takes the country code without the plus sign.
      const mobiles = to.replace(/^\+/, "");
      if (!/^91[6-9]\d{9}$/.test(mobiles)) throw new SmsDeliveryError("Not an Indian mobile number.");

      let response: Response;
      try {
        response = await send(MSG91_FLOW_URL, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            authkey: config.authKey,
          },
          body: JSON.stringify({
            template_id: config.otpTemplateId,
            short_url: "0",
            // Ask for the provider's verdict in this response rather than a queued acknowledgement.
            realTimeResponse: "1",
            recipients: [{ mobiles, [config.otpVariable]: otp.code }],
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const timedOut = error instanceof Error && error.name === "TimeoutError";
        throw new SmsDeliveryError(
          timedOut ? "MSG91 did not answer in time." : "MSG91 could not be reached.",
        );
      }

      // MSG91 reports some failures with HTTP 200 and type "error", so both are checked. Its documentation
      // shows the result both at the top level and under "data".
      const body = (await response.json().catch(() => null)) as {
        type?: string;
        message?: unknown;
        data?: { type?: string; message?: unknown };
      } | null;
      const type = body?.type ?? body?.data?.type;
      if (!response.ok || type !== "success") {
        throw new SmsDeliveryError(
          `MSG91 refused the message (HTTP ${response.status}): ${safe(body?.message ?? body?.data?.message)}`,
        );
      }
    },
  };
}
