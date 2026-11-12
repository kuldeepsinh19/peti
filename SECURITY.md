# Security policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately through GitHub's
[private vulnerability reporting](https://github.com/kuldeepsinh19/peti/security/advisories/new) for this
repository. Do not open a public issue or pull request for a security problem.

Include what you found, how to reproduce it, and the impact you expect. We aim to acknowledge reports within
five working days. This is a volunteer-maintained open-source project with no bug bounty.

## Scope

Peti is an MVP that runs with demonstration data and a sandbox payment provider. In scope: anything that
would let someone read or change another person's data, confirm a booking without paying, move or misstate
money, bypass administrator checks, escape upload validation, or reach development tooling in production.

## What the project does to protect users

Summarised here; details in [security architecture](docs/architecture/security-architecture.md).

- Server-side authorisation in every use case; administrator actions are audit-logged in an append-only log.
- Database constraints and triggers that make double bookings, illegal status changes, inconsistent money
  and edits to history impossible even if application code is wrong.
- Payments confirmed only after signature verification and a server-to-server check with the provider.
- Uploads validated by content, re-encoded, and stripped of metadata including location.
- Contact details shared only after a booking is paid; no identity documents collected.
- Rate limits on sign-in, sign-up, password reset, one-time codes, booking requests and uploads.
- Production start-up refuses the sandbox payment provider, the dev outbox and local-disk storage.

## Supported versions

Only the latest commit on `main` is supported.
