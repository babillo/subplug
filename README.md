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

| Command            | What it does                                                       |
| ------------------ | ------------------------------------------------------------------ |
| `pnpm db:check`    | Connects and prints the database name and Postgres version         |
| `pnpm db:generate` | Turns changes in `packages/db/src/schema` into a new SQL migration |
| `pnpm db:migrate`  | Applies new migrations to the database (safe to run repeatedly)    |
| `pnpm db:seed`     | Fills the database with test data                                  |
| `pnpm db:studio`   | Opens Drizzle Studio, a browser view of your tables                |

The usual flow after editing the schema: `pnpm db:generate`, review the SQL file it created in
`packages/db/migrations`, then `pnpm db:migrate`. Commit the migration files.

## Tests and checks

| Command             | What it does                                |
| ------------------- | ------------------------------------------- |
| `pnpm test`         | Runs all tests (Vitest, in `packages/core`) |
| `pnpm typecheck`    | Checks TypeScript types in every package    |
| `pnpm lint`         | Runs ESLint in every package                |
| `pnpm format`       | Formats every file with Prettier            |
| `pnpm format:check` | Reports files that aren't formatted         |
| `pnpm build`        | Production build                            |

`pnpm test` also runs the VTpass **sandbox** tests (real HTTP, no real money) when `VTPASS_API_KEY`
is set, e.g. in `.env.local`; otherwise they're skipped. To run only those:

```bash
pnpm --filter @repo/core test:integration
```

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
