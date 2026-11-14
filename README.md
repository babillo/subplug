# SubPlug

A wallet-based VTU (virtual top-up) platform for Nigeria: fund a wallet, then buy data, airtime,
cable TV and electricity. See [CLAUDE.md](./CLAUDE.md) for the project rules and roadmap.

> The product name lives in one file: `packages/shared/src/brand.json`. Change it there to rebrand
> the web and mobile apps.

## What's in here

```
apps/
  web/                 Next.js (App Router, TypeScript, Tailwind) — site, dashboard, /admin
  mobile/              Expo (React Native, Expo Router, TypeScript) — Android/iOS app
packages/
  core/                Business logic (wallet ledger, pricing, orders, provider adapters) + Vitest tests
  db/                  Database schema and migrations (Drizzle + PostgreSQL) — coming next
  shared/              Types, validation schemas and brand config shared by web and mobile
  config-typescript/   Shared tsconfig presets
  config-eslint/       Shared ESLint rules
```

This is a **monorepo**: several apps and packages in one Git repository. **pnpm** installs all of
them with one command, and **Turborepo** runs scripts (dev, test, lint…) across them and caches the
results.

## Requirements

- [Node.js](https://nodejs.org) 22 or newer
- [pnpm](https://pnpm.io) 10 — easiest via `corepack enable` (ships with Node)
- A free [Neon](https://neon.tech) account — our hosted PostgreSQL database (no Docker needed)
- For the mobile app: the **Expo Go** app on your phone, or an Android emulator / iOS simulator

## Database: Neon

Development uses the `dev` branch of the Neon project **"SubPlug project"**
(`nameless-poetry-89567642`). The `production` branch stays untouched until launch.

1. In the Neon console, open "SubPlug project", click **Connect**, pick the `dev` branch, and copy
   the connection string. It looks like
   `postgresql://USER:PASSWORD@ep-xxxx.REGION.aws.neon.tech/neondb?sslmode=require`.
2. Use that string as `DATABASE_URL` in `.env.local` on your laptop. It contains a password: never
   commit it or paste it into a chat.

Environment variables are read from the real environment first, then from `.env.local` at the repo
root to fill in anything missing.

## Setup on your laptop (Claude Code desktop or terminal)

```bash
pnpm install
```

```bash
cp .env.example .env.local
```

Open `.env.local` (repo root) and fill in `DATABASE_URL` and the VTpass keys. It's git-ignored.
Then check the database connection:

```bash
pnpm db:check
```

All database work against Neon (migrations, seed data, real sandbox purchases) runs from the laptop.

## Setup in the cloud environment (Claude Code on the web / app)

Cloud sessions **can't connect to Neon's database**: their network only allows web (HTTPS) traffic,
and Postgres uses a direct connection on port 5432. So:

- Don't add `DATABASE_URL` to the cloud environment's settings.
- Automated database tests in the cloud use a throwaway PostgreSQL installed inside the cloud
  machine, not Neon.
- The Neon API does work from the cloud (it's HTTPS). A Neon API key is saved on the cloud
  environment for managing branches.

There is no `.env.local` in the cloud. Any other variables a cloud session needs go in the cloud
environment's settings (the environment menu in the session's title bar, then **Edit**). Values
saved there are visible to anyone who can edit that environment, so only ever use test/sandbox keys
there. The cloud has no Docker, so nothing in this repo depends on it.

## Run the apps

**Web app** (http://localhost:3000):

```bash
pnpm dev
```

**Mobile app** (opens the Expo dev server; scan the QR code with Expo Go, or press `a` for Android,
`i` for iOS):

```bash
pnpm dev:mobile
```

## Database scripts

All of these use `DATABASE_URL`.

| Command            | What it does                                                         |
| ------------------ | -------------------------------------------------------------------- |
| `pnpm db:check`    | Connects and prints the database name and Postgres version           |
| `pnpm db:generate` | Turns changes in `packages/db/src/schema` into a new SQL migration   |
| `pnpm db:migrate`  | Applies new migrations to the database (safe to run repeatedly)      |
| `pnpm db:seed`     | Adds test data: a test user with ₦5,000, MTN/Airtel airtime and data |
| `pnpm db:studio`   | Opens Drizzle Studio, a browser view of your tables                  |

The usual flow after editing the schema: `pnpm db:generate`, review the SQL file it created in
`packages/db/migrations`, then `pnpm db:migrate`. Commit the migration files.

`pnpm db:seed` is safe to run repeatedly. It fetches real data plan codes from the VTpass sandbox,
so it needs the VTpass keys; without them it adds everything except the data plans. The test user
is `seed-user@example.test`. Its ₦5,000 goes in as a normal ledger credit, once.

## Tests and checks

| Command             | What it does                                |
| ------------------- | ------------------------------------------- |
| `pnpm test`         | Runs all tests (Vitest, in `packages/core`) |
| `pnpm typecheck`    | Checks TypeScript types in every package    |
| `pnpm lint`         | Runs ESLint in every package                |
| `pnpm format`       | Formats every file with Prettier            |
| `pnpm format:check` | Reports files that aren't formatted         |
| `pnpm build`        | Production build                            |

### Database tests (wallet ledger)

The wallet tests need a real PostgreSQL, because what they test (row locking when two purchases
happen at once) only exists in a real database. They **delete all data** in that database, so they
use `TEST_DATABASE_URL`, never `DATABASE_URL`, and refuse to run if the two are the same. Without
`TEST_DATABASE_URL`, `pnpm test` skips them and prints a warning.

- **Laptop:** create a separate Neon branch called `test` in "SubPlug project" and put its
  connection string in `.env.local` as `TEST_DATABASE_URL`. The tests create the tables themselves.
- **Cloud:** install a throwaway local PostgreSQL in the session and point `TEST_DATABASE_URL` at it:

```bash
apt-get install -y postgresql && service postgresql start
```

```bash
su postgres -c "psql -c \"create role subplug_test login password 'subplug_test'\"" && su postgres -c "createdb -O subplug_test subplug_test"
```

```bash
TEST_DATABASE_URL=postgres://subplug_test:subplug_test@localhost:5432/subplug_test pnpm test
```

`pnpm test` also runs the VTpass **sandbox** tests (real HTTP, no real money) when `VTPASS_API_KEY`
is set, e.g. in `.env.local`; otherwise they're skipped. To run only those:

```bash
pnpm --filter @repo/core test:integration
```

## Wallet funding (Monnify sandbox)

Each customer gets their own bank account number. Money sent to it is credited to their wallet.

1. **Get sandbox keys:** sign up at app.monnify.com, then **Developer** → API keys. Put
   `MONNIFY_API_KEY` (starts with `MK_TEST_`), `MONNIFY_SECRET_KEY` and `MONNIFY_CONTRACT_CODE` in
   `.env.local`, with `MONNIFY_BASE_URL=https://sandbox.monnify.com`.
2. **Create the seed user's account number** (the sandbox accepts any 11 digits as a BVN):

```bash
pnpm funding:account 22222222222
```

3. **Send a test payment with Monnify's payment simulator** (websim.sdk.monnify.com → Transfer):
   enter the account number and an amount. **Never send real money to sandbox account numbers**:
   real bank transfers don't reach the sandbox.
4. **Credit it.** Without a public URL Monnify can't reach your laptop's webhook, so use the backup
   job, which asks Monnify directly for each account's payments:

```bash
pnpm funding:reconcile
```

Run `pnpm funding:account` again to see the new balance. Each payment is credited at most once,
however many times you run it.

**Funding fee:** ₦50 per deposit (₦5,000 sent → ₦4,950 credited), waived on deposits of ₦50 or
less. Both the amount received and the fee are recorded. Change it in
`packages/core/src/funding/fees.ts`.

How a payment is credited safely: the webhook signature is checked, then Monnify is asked directly
how much was paid and into which account. **Only Monnify's answer counts**; the amount in the
webhook itself is ignored. The customer's BVN/NIN is sent to Monnify and never stored by us.

API (signed-in customers, see "Signing in" below):

- `POST /api/wallet/funding-accounts` with `{ "bvn": "..." }` or `{ "nin": "..." }` creates the
  account numbers. `GET` lists them.
- `POST /api/webhooks/monnify` receives Monnify's notifications. Pointing Monnify at it needs a
  public URL (a deployed site or a tunnel); that comes with deployment.

## Purchases (sandbox)

| Command                       | What it does                                                            |
| ----------------------------- | ----------------------------------------------------------------------- |
| `pnpm orders:try`             | Buys the cheapest MTN data plan for the seed user on the VTpass sandbox |
| `pnpm orders:try airtime 100` | Buys ₦100 MTN airtime instead                                           |
| `pnpm orders:recheck`         | Settles orders pending for 2+ minutes: success, or failed and refunded  |

Both print the order and the wallet's ledger entries. They use `DATABASE_URL` and the VTpass keys,
so run them on the laptop after `pnpm db:migrate` and `pnpm db:seed`. `orders:recheck` is safe to
run any time; it will be scheduled on Cloudflare later. Orders pending for over 24 hours are listed
for a human to check, never refunded automatically.

## Signing in (API)

Customers sign in with a one-time code sent to their phone or email; no passwords. In development
the code is **printed in the terminal running `pnpm dev`** (`OTP_SENDER=console`), no SMS needed.
Set `AUTH_SECRET` in `.env.local` first (generate one with `openssl rand -hex 32`).

1. `POST /api/auth/otp` with `{ "destination": "08031234567" }` (or an email). Then read the code
   from the terminal.
2. `POST /api/auth/sign-in` with `{ "destination", "code" }`. A new customer gets
   `{ "status": "profile_required" }`; send the same request again with `fullName` and `email`
   added (the code still works).
3. Signed in: the web gets a secure `session` cookie. The mobile app sends header
   `x-client: mobile` and also gets a `token`, which it sends back as `Authorization: Bearer …`.
4. `POST /api/auth/pin` with `{ "pin": "2580" }` sets the 4-digit transaction PIN (to change it
   later, add `currentPin`). Easy PINs like `0000` or `1234` are refused.

Other routes: `GET /api/auth/me`, `POST /api/auth/sign-out`, `POST /api/auth/pin/reset-code` (sends
a PIN-reset code) and `POST /api/auth/pin/reset` with `{ "code", "pin" }`. After **5 wrong PINs**,
purchases are locked until the PIN is reset with a code.

The seed user (`seed-user@example.test`, phone `08011111111`) has the dev PIN `1357`.

### The orders API

`POST /api/orders` buys from the wallet. It needs a signed-in customer and their PIN:

```bash
curl -X POST http://localhost:3000/api/orders -H "content-type: application/json" -H "authorization: Bearer TOKEN" -d '{"productId":"PRODUCT_ID","recipientPhone":"08011111111","faceValueKobo":10000,"clientReference":"tap-1","pin":"1357"}'
```

- `faceValueKobo`: airtime only, in kobo (₦100 = `10000`). Data plans have a fixed price.
- `clientReference`: a random id per "Buy" tap. Sending it again returns the same order
  (`duplicate: true`) instead of charging twice.
- Answers: `201` new order (`success`, `pending`, or `failed` and already refunded), `200` repeated
  tap, `400` invalid input, `401` not signed in, `402` balance too low, `403` wrong PIN (with
  `attemptsRemaining`), `409` no PIN set yet, `423` PIN locked, `429` same number within 15 seconds
  (with `Retry-After`).

## Customer and admin API

Signed-in customers (cookie on the web, `Authorization: Bearer` on mobile):

| Route                                         | What it returns                             |
| --------------------------------------------- | ------------------------------------------- |
| `GET /api/products`                           | What they can buy, at **their** tier price  |
| `GET /api/wallet`                             | Balance and funding account numbers         |
| `GET /api/wallet/transactions?limit=&offset=` | Wallet statement, newest first              |
| `GET /api/orders?status=&limit=&offset=`      | Their orders, newest first                  |
| `GET /api/orders/:id`                         | One of their orders (404 for anyone else's) |

**Admins.** Make the first admin from the laptop (they must have signed up first). There is no web
route for this, on purpose:

```bash
pnpm admin:grant 08031234567
```

Every admin change is written to the audit log with before/after values.

| Route                                   | What it does                                                           |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `GET /api/admin/users?search=`          | Customers with balances (search name, email or phone)                  |
| `GET /api/admin/users/:id`              | One customer: balance, PIN state, funding accounts                     |
| `POST /api/admin/users/:id/wallet`      | Manual credit/debit: `{ direction, amountKobo, note, idempotencyKey }` |
| `POST /api/admin/users/:id/status`      | Suspend/reactivate: `{ status, note }`                                 |
| `GET /api/admin/orders?status=&stuck=1` | All orders; `stuck=1` = pending over 24 hours                          |
| `POST /api/admin/orders/:id/settle`     | Settle a stuck order: `{ outcome, note }` (`failed` refunds once)      |
| `GET /api/admin/products`               | All products with provider cost and tier prices                        |
| `POST /api/admin/products/:id/price`    | `{ tier, priceKobo }` (data) or `{ tier, discountBps }` (airtime)      |
| `POST /api/admin/products/:id/status`   | Turn a product on/off: `{ active, note? }`                             |
| `GET /api/admin/audit-log`              | Every admin change, newest first                                       |

A data price below what VTpass charges is refused unless the request includes
`"allowBelowCost": true`. Manual credits/debits need a note and an `idempotencyKey`: sending the
same key again (double-click, retry) returns the first result and moves no money.

## VTpass sandbox check

Prints the sandbox wallet balance and the MTN data plans, to confirm the keys work:

```bash
pnpm vtpass:check
```

It never prints your keys. If a setting is missing it names the variable, not its value.

Getting the sandbox keys: log in at sandbox.vtpass.com, open **Profile → API Keys**, and copy the
API key, the public key (`PK_…`) and the secret key (`SK_…`) into `.env.local`. On that page, set
**API authentication type** to **All** or **API Keys**. If it's left on **Basic**, VTpass ignores
the keys and every request fails with HTTP 401 `"Invalid Credentials."`, even with correct keys.

Products are **switched off by default**, separately in the sandbox and in live. Turn on each one we
sell (start with MTN Airtime and MTN Data) at sandbox.vtpass.com → **Profile → Product Settings**.
Otherwise purchases fail with code `028` "PRODUCT IS NOT WHITELISTED ON YOUR ACCOUNT".

Watch mode while writing tests in `packages/core`:

```bash
pnpm --filter @repo/core test:watch
```

## Working in one package

Use `--filter` to run a command in a single app or package, for example:

```bash
pnpm --filter web add some-package
```

For the mobile app, add packages with Expo's installer so versions match the Expo SDK:

```bash
pnpm --filter mobile exec expo install some-package
```
