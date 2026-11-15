# SMS verification codes

Peti verifies a mobile number with a 6-digit code. Better Auth generates the code, allows 5 attempts and
expires it after 5 minutes; the application limits how often a number and an account can ask for one. An SMS
provider only **delivers** the code.

**Status**

| Part                                         | State                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| Code generation, storage, attempts, limits   | Implemented and tested                                                               |
| Dev outbox (`SMS_DRIVER=outbox`)             | Implemented and tested; local, test and the locked demo only                         |
| MSG91 adapter (`SMS_DRIVER=msg91`)           | Implemented from MSG91's documentation and unit-tested. **Never run against MSG91.** |
| MSG91 account, DLT registration, credentials | Do not exist. Nothing has been sent to a real phone.                                 |

Production refuses to start with `SMS_DRIVER=outbox`.

## The port

```ts
interface SmsSender {
  sendOtp(to: string, otp: { code: string; expiresInMinutes: number }): Promise<void>;
}
```

The code is passed as a value, not as message text. In India the wording of a commercial SMS is a template
approved in advance (below); the provider fills the code into it. The application cannot change the wording
by changing a string.

## Why MSG91

Prices are indicative, from providers' public pages in November 2026; confirm them before choosing.

| Provider      | Price per SMS (about) | Notes                                                                         |
| ------------- | --------------------- | ----------------------------------------------------------------------------- |
| **MSG91**     | ₹0.15–0.25            | Indian provider; DLT template flow built in; documented HTTP API; chosen      |
| 2Factor       | ₹0.17                 | Cheaper; OTP-focused; smaller documentation and tooling                       |
| Fast2SMS      | ₹0.25                 | Simple; weaker delivery reporting                                             |
| Twilio Verify | ₹0.45                 | Best tooling; about twice the price; you still need your own DLT registration |

All of them need the DLT registration below. The adapter is about 90 lines behind a one-method port, so
changing provider later is a small change.

## DLT registration (required before any SMS can be sent)

TRAI requires every business that sends commercial SMS in India to register on a telecom operator's
Distributed Ledger Technology (DLT) platform. Unregistered messages are blocked by the operators.

1. **Register the business as a Principal Entity** on one operator's DLT portal (Jio, Airtel, Vi or BSNL).
   It needs the company's PAN, GST or incorporation documents and an authorisation letter. There is a
   one-time fee of about ₹5,900. Approval takes a few working days.
2. **Register a header** (the 6-character sender ID, for example `PETIIN`). 1–3 working days.
3. **Register the content template**, as _Service Implicit_ (a transactional message the user asked for).
   1–3 working days. The template has fixed text and a variable for the code:

   ```
   {#var#} is your Peti verification code. It expires in 5 minutes. Do not share it with anyone.
   ```

   The expiry in the template must match the application's (`OTP_EXPIRES_MINUTES` in
   `modules/auth/infrastructure/better-auth.ts`).

4. **Add the approved header and template to MSG91**, with their DLT ids. MSG91 gives the template its own
   **template id** (called a flow id in older documentation) and a name for the variable.

Allow two weeks from start to first message. Nothing in this list can be done in code.

## Configuration

```bash
SMS_DRIVER=msg91
MSG91_AUTH_KEY=...            # MSG91 → API → Authkey. A secret: keep it in the secret store.
MSG91_OTP_TEMPLATE_ID=...     # MSG91's id for the approved template
MSG91_OTP_VARIABLE=OTP        # the variable's name in the MSG91 template, without the ## markers
```

`MSG91_OTP_VARIABLE` defaults to `OTP`; if the MSG91 template calls its variable `##VAR1##`, set it to
`VAR1`. The names are case-sensitive.

## What the adapter sends

From MSG91's [Send SMS documentation](https://docs.msg91.com/sms/send-sms), read on 15 November 2026:

```http
POST https://control.msg91.com/api/v5/flow
authkey: <MSG91_AUTH_KEY>
content-type: application/json

{
  "template_id": "<MSG91_OTP_TEMPLATE_ID>",
  "short_url": "0",
  "realTimeResponse": "1",
  "recipients": [{ "mobiles": "919876543210", "OTP": "482913" }]
}
```

- The number is sent with the country code and no plus sign, as MSG91 expects.
- The auth key travels in a header and the code in the body. Nothing secret is in the URL.
- The request times out after 10 seconds.
- **Success** is HTTP 2xx **and** `type: "success"` in the body. MSG91 reports some failures with HTTP 200
  and `type: "error"`, so both are checked.
- Failures throw `SmsDeliveryError`. Its message never contains the auth key, the number or the code; a
  provider message that echoes a long number is masked.

MSG91 also has a dedicated SendOTP API that can generate and verify codes itself. Peti does not use it:
generation, attempt limits and expiry stay in one place (Better Auth), and that API takes the code in the
query string.

## Verifying it before launch

The adapter has only been tested against a stubbed `fetch`. Before relying on it:

1. In a staging environment with real credentials, verify a real number end to end.
2. Confirm the success response shape. The documentation shows the result both at the top level and under
   `data`; the adapter accepts both, and this is the least certain part.
3. Send to a number on each major operator, and check delivery time (the code lives 5 minutes).
4. Trigger each failure on purpose — wrong auth key, wrong template id, wrong variable name — and confirm
   each is reported as a failure and logged without secrets.
5. Check the cost per verification on the MSG91 report against the expected price.

## Limits that already protect the SMS budget

- A code is sent only to a signed-in user, for their own account; anonymous requests are refused.
- Requests are limited per client address, and to 5 an hour per account and per phone number
  ([security-architecture.md](../architecture/security-architecture.md)).
- In the locked demo, phone verification is switched off altogether.

Not built: an alert on unusual SMS volume, a daily spending cap, and a voice-call fallback.
