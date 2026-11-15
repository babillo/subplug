import { getSystemStatus } from "@repo/core";
import { formatNaira } from "@repo/shared/money";
import type { Metadata } from "next";
import Link from "next/link";

import { AdminMfaGate } from "@/components/admin/admin-mfa-gate";
import { Badge, Stat } from "@/components/admin/bits";
import { Card, Notice, PageTitle } from "@/components/ui";
import { formatWhen } from "@/lib/format";
import { getAdminAccess } from "@/lib/server/admin-page";
import { getServices } from "@/lib/server/services";

export const metadata: Metadata = { title: "System" };

/** Checks admin access and two-step sign-in on every request, then shows the page. */
export default async function Page() {
  const access = await getAdminAccess();
  if (access.state === "needs_mfa") return <AdminMfaGate access={access} />;
  return AdminSystemPage();
}

function every(minutes: number) {
  if (minutes >= 60 * 24) return "daily";
  if (minutes >= 60) return `every ${minutes / 60} h`;
  return `every ${minutes} min`;
}

async function AdminSystemPage() {
  const { db, getProvider } = getServices();
  const s = await getSystemStatus(db, { getProvider });
  const staleJobs = s.jobs.filter((j) => j.stale);

  return (
    <>
      <PageTitle
        title="System"
        subtitle="Is everything running, and can VTpass cover what customers can spend?"
      />

      {!s.ledgerMatches && (
        <Notice tone="bad">
          Wallet balances don’t match the ledger. Stop manual changes and investigate first.
        </Notice>
      )}
      {s.providerCoversWallets === false && (
        <Notice tone="bad">
          VTpass holds less than customers could spend right now. Top up VTpass soon, or purchases
          will start failing (they’d be refunded automatically).
        </Notice>
      )}
      {s.provider.error && (
        <Notice tone="warn">Couldn’t read the VTpass balance: {s.provider.error}</Notice>
      )}
      {staleJobs.length > 0 && (
        <Notice tone="warn">
          {staleJobs.length === s.jobs.length
            ? "Background jobs haven’t run recently."
            : `${staleJobs.map((j) => j.label).join(", ")}: not running as expected.`}{" "}
          On the laptop, run <code>pnpm jobs:run</code>. Once hosted, they run on a schedule.
        </Notice>
      )}
      {s.stuckCount > 0 && (
        <Notice tone="warn">
          {s.stuckCount} order{s.stuckCount === 1 ? "" : "s"} pending for over 24 hours.{" "}
          <Link href="/admin/orders?status=stuck" className="underline">
            Resolve them
          </Link>
          .
        </Notice>
      )}

      <section aria-label="Money" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="VTpass balance"
          value={
            s.provider.balanceKobo === null
              ? "—"
              : formatNaira(s.provider.balanceKobo, { compact: true })
          }
          tone={s.providerCoversWallets === false ? "bad" : undefined}
          detail={s.provider.error ? "Couldn’t read it" : "What we can spend on purchases"}
        />
        <Stat
          label="Money in wallets"
          value={formatNaira(s.walletsTotalKobo, { compact: true })}
          detail={
            s.ledgerMatches ? (
              <span className="text-ok">✓ Matches the ledger</span>
            ) : (
              <span className="text-bad">Doesn’t match the ledger</span>
            )
          }
        />
        <Stat
          label="Stuck orders"
          value={String(s.stuckCount)}
          tone={s.stuckCount > 0 ? "warn" : undefined}
          detail="Pending over 24 hours"
          href="/admin/orders?status=stuck"
        />
        <Stat
          label="Errors (24 h)"
          value={String(s.errorsLast24h)}
          tone={s.errorsLast24h > 0 ? "bad" : undefined}
          detail="“Something went wrong” replies"
        />
      </section>
      <p className="-mt-3 text-sm text-muted">
        The sandbox VTpass balance is play money; the live one is what you’ve paid VTpass.
      </p>

      <Card className="grid gap-2">
        <h2 className="font-display text-lg font-semibold">Background jobs</h2>
        <ul className="grid">
          {s.jobs.map((j) => (
            <li
              key={j.job}
              className="grid gap-1 border-b border-line py-3 text-sm last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <div className="font-semibold">{j.label}</div>
                <div className="text-muted">
                  Should run {every(j.everyMinutes)} ·{" "}
                  {j.lastRunAt ? `last run ${formatWhen(j.lastRunAt)}` : "never run"}
                  {j.lastOk === false && j.lastOkAt && ` · last success ${formatWhen(j.lastOkAt)}`}
                </div>
                {j.lastOk === false && j.lastError && (
                  <div className="truncate text-bad" title={j.lastError}>
                    {j.lastError}
                  </div>
                )}
              </div>
              <div>
                {j.lastRunAt === null ? (
                  <Badge tone="warn">Never run</Badge>
                ) : j.lastOk === false ? (
                  <Badge tone="bad">Failed</Badge>
                ) : j.stale ? (
                  <Badge tone="warn">Overdue</Badge>
                ) : (
                  <Badge tone="ok">OK</Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="grid gap-2">
        <h2 className="font-display text-lg font-semibold">Recent server errors</h2>
        {s.recentErrors.length === 0 ? (
          <p className="py-4 text-center text-muted">None. 🎉</p>
        ) : (
          <ul className="grid">
            {s.recentErrors.map((e) => (
              <li
                key={e.id}
                className="grid gap-1 border-b border-line py-3 text-sm last:border-b-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <code className="font-semibold">{e.context}</code>
                  <span className="text-xs text-muted">{formatWhen(e.createdAt)}</span>
                </div>
                <div className="text-bad">{e.message}</div>
                {e.detail && (
                  <details>
                    <summary className="cursor-pointer text-xs font-semibold text-muted">
                      Details
                    </summary>
                    <pre className="mt-1 overflow-x-auto rounded-lg bg-paper p-2 text-xs">
                      {e.detail}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
