# SubPlug — VTU Platform

Working name: **SubPlug** (may change; keep the brand name in one config file, never hard-coded).

A wallet-based VTU (virtual top-up) platform for Nigeria. Users fund a wallet by bank transfer or card, then buy data, airtime, cable TV and electricity instantly. Web app + admin panel + Android/iOS app, sharing one backend.

## About the owner
- I'm a designer/front-end developer (Figma, HTML/CSS/JS, Next.js). I'm not a backend engineer.
- Explain backend and money-handling decisions in plain words before you make them.
- Prefer boring, well-documented tools over clever ones.

## Stack
- **Monorepo:** Turborepo + pnpm
  - `apps/web` — Next.js (App Router, TypeScript, Tailwind) — marketing site, customer dashboard, `/admin`
  - `apps/mobile` — Expo (React Native, TypeScript, Expo Router)
  - `packages/core` — business logic: wallet ledger, pricing, order flow, provider adapters
  - `packages/db` — Drizzle ORM schema + migrations (PostgreSQL)
  - `packages/shared` — shared types and Zod validation schemas used by web and mobile
- **Database:** PostgreSQL on Neon (dev branch for development). Connected via `DATABASE_URL`; no Docker.
- **Hosting:** Cloudflare Workers (OpenNext adapter) for web/API; Workers Paid plan before going live.
- **Tests:** Vitest. Money code must have tests.

## Non-negotiable rules (money safety)
1. **Ledger only.** A wallet balance is the sum of `ledger_entries`. Never `UPDATE` a balance directly. `wallets.balance` is a cache updated in the same DB transaction as the ledger insert.
2. **Kobo integers.** Store and calculate all money as integer kobo (₦1 = 100). No floats, anywhere.
3. **Debit before send.** Lock the wallet row (`SELECT ... FOR UPDATE`), check balance, debit, then call the provider. If the provider fails, refund with a new credit ledger entry.
4. **Idempotency.** Every order has a unique `request_id`; every funding event has a unique gateway reference (DB unique constraint). Retries and duplicate webhooks must never pay or credit twice.
5. **Pending is normal.** Orders can stay `pending`. A background job re-queries the provider until `success` or `failed` → refund.
6. **Secrets stay on the server.** Provider and gateway keys live in env vars on the backend only. The web client and mobile app never call VTpass, Monnify or Paystack directly.
7. **Verify webhooks.** Check the signature, then re-query the gateway before crediting.
8. **Transaction PIN** required for every purchase; hash it (argon2/bcrypt); lock after 5 wrong tries.
9. **Audit everything admins do** (manual credit/debit, price changes, refunds) with before/after values.
10. **Tests first for money code.** Write tests for any code that moves money, including double-spend and duplicate-webhook cases, before the implementation.

## Providers
- **VTU:** VTpass first (sandbox now). Build a `ProviderAdapter` interface so more providers (e.g. VTU.ng) plug in later; each product row in the DB points to a provider, switchable from admin.
- **VTpass specifics:**
  - Sandbox base URL `https://sandbox.vtpass.com/api`
  - GET requests: headers `api-key` + `public-key`; POST: `api-key` + `secret-key`
  - `request_id`: first 12 characters = current Lagos time `YYYYMMDDHHmm` (Africa/Lagos, UTC+1), then a random suffix
  - Endpoints: `/balance`, `/service-variations?serviceID=...`, `/pay`, `/requery`
  - Sandbox test phone: `08011111111`
  - Learned from the real sandbox (differs from or isn't in the docs):
    - Profile → API Keys → **API authentication type** must be "All" or "API Keys". On "Basic", VTpass ignores the keys: HTTP 401 plain-text `"Invalid Credentials."`.
    - Products are off by default. Enable each one in Profile → **Product Settings** (sandbox and live separately), else code `028`.
    - Code `019` "likely duplicate": any new purchase to the **same recipient within 15 seconds**, whatever the service (docs say 30s, same service). Not charged → failed → refund. The purchase flow should tell customers to wait ~15s, not just show "failed".
    - The status mapping and the codes still unconfirmed are documented in `packages/core/src/providers/vtpass/status-map.ts`.
- **Wallet funding:** **Monnify sandbox now** (reserved accounts, behind the `FundingGateway` adapter in `packages/core/src/funding/`); **Paystack later** as a second adapter. Flutterwave ruled out (fees). Going live with any gateway needs a CAC-registered business + KYC.
  - Monnify's docs site blocks automated readers. Endpoints and signing were confirmed from Monnify's official Node library (`monnify-nodejs-lib` on npm): login `POST /api/v1/auth/login` (Basic apiKey:secretKey), reserve `POST /api/v2/bank-transfer/reserved-accounts` (needs customer BVN or NIN; we never store it), verify `GET /api/v2/transactions/{ref}`, webhook header `monnify-signature` = HMAC-SHA512 of the body with the secret key. Amounts are naira (number or text) → `decimalToKobo()`.
  - Crediting always re-asks Monnify for the paid amount and account; the webhook's own amount is never used. Monnify's sandbox may not sign webhooks: unsigned ones are accepted in sandbox only.
  - **Funding fee:** flat ₦50 per deposit, waived on deposits of ₦50 or less (placeholder; one place to change: `packages/core/src/funding/fees.ts`). Stored as `funding_events.fee_kobo`; the wallet is credited amount − fee.
  - Business: Monnify account exists under the owner's CAC "M-SALMAN VENTURES"; address verification pending, so sandbox/test mode only for now.
  - Verified on the laptop with the real Monnify sandbox: reserving accounts (Sterling + Wema numbers; account name shown as "See", Monnify shortens names) and crediting a payment end to end via `funding:reconcile` (₦5,000 simulator payment → ₦4,950 credited after the ₦50 fee). Sandbox accounts only receive payments from Monnify's payment simulator (websim.sdk.monnify.com), never real bank transfers. Not yet verified: a real Monnify webhook reaching us (needs a public URL; comes with deployment).

## Env vars (never commit real values)
```
DATABASE_URL=
TEST_DATABASE_URL=   # separate DB for tests (they wipe it); never the same as DATABASE_URL
VTPASS_BASE_URL=https://sandbox.vtpass.com/api
VTPASS_API_KEY=
VTPASS_PUBLIC_KEY=
VTPASS_SECRET_KEY=
MONNIFY_BASE_URL=https://sandbox.monnify.com
MONNIFY_API_KEY=
MONNIFY_SECRET_KEY=
MONNIFY_CONTRACT_CODE=
AUTH_SECRET=         # ≥32 random chars (openssl rand -hex 32); keys one-time code hashes
OTP_SENDER=console   # "console" prints sign-in codes in the server terminal (dev only); SMS/email provider later
```
`.env*` files are git-ignored. Keep a `.env.example` with empty values.

## Auth (step 5)
- Sign-in with one-time codes to a Nigerian phone or an email (no passwords): 6 digits, 10-minute expiry, 5 tries, 1 per minute and 5 per hour per destination; stored as an HMAC keyed with `AUTH_SECRET`. New customers also give full name (+ email when signing up by phone: Monnify needs it).
- Codes go through an `OtpSender` (`packages/core/src/auth/`). Only `ConsoleOtpSender` exists (dev; refuses production). An SMS/email provider (e.g. Termii, Resend) is still to be chosen.
- Sessions: own implementation (no auth library). Random 256-bit token; only its SHA-256 is stored; 30 days. Web: HttpOnly `session` cookie (SameSite=Lax, Secure in prod) + Origin check on state-changing cookie requests. Mobile: `Authorization: Bearer`, token returned in the sign-in body only with header `x-client: mobile`.
- Transaction PIN: 4 digits (no 0000/1234-style), bcrypt via `bcryptjs` (works on Cloudflare Workers). 5 wrong tries (counted in the DB under a row lock) locks purchases until reset with a `pin_reset` code. `buy()` checks the PIN before any money moves.
- Seed user dev PIN: `1357` (test data only).

## Setup
- I run Claude Code in two places, both on this GitHub repo: a **cloud environment** and my **desktop**.
- **Env vars in the cloud** come from the cloud environment's settings (no `.env` file there).
- **Env vars on my laptop** come from `.env.local` at the repo root (copy `.env.example`).
- Real env vars win over `.env.local`.
- Docker is not available in the cloud, so nothing may depend on it.
- **Neon project:** "SubPlug project" (`nameless-poetry-89567642`). Development uses its `dev` branch, never `production`. Its `test` branch (endpoint `ep-little-violet-…`) is for `TEST_DATABASE_URL` on the laptop; tests wipe it. Ignore "my-first-project" (`broad-sunset-24732751`); it is unused.
- **Cloud sessions cannot connect to Postgres directly** (their network only allows HTTPS, not raw TCP on port 5432). So:
  - Database work against Neon (migrations, seed, real sandbox purchases) runs on my laptop.
  - Automated DB tests in the cloud use a throwaway local PostgreSQL installed in the container, not Neon.
  - Do not put `DATABASE_URL` in the cloud environment's settings.
  - The Neon API (HTTPS) does work from the cloud: a Neon API key is saved on the cloud environment for managing branches.

## Working style
- One feature per session. Plan first, show me the plan, then build.
- Small commits with clear messages.
- After each feature: run tests, typecheck and lint, and tell me what changed in plain words.
- Ask before adding a new dependency or service.
- Never push to main,  work on staging/preview branch and ask to open PR

## Roadmap
1. Monorepo setup + DB + VTpass adapter (sandbox) ✅
2. Wallet ledger core (credit/debit, tests) ✅
3. Wallet funding (virtual account + webhook, test mode) ✅ (Monnify sandbox; webhook untested against real Monnify until deployed)
4. Purchase flow: data + airtime, pending re-check, auto-refund ✅
5. Auth (phone/email OTP) + transaction PIN ✅ (dev code sender; real SMS/email provider still to pick)
6. Web dashboard + admin panel
7. Expo mobile app
8. Hardening: rate limits, admin 2FA, monitoring
9. Phase 2: cable, electricity, reseller tier, referrals