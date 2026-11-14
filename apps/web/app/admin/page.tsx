import { getAdminOverview, listOrdersAdmin } from "@repo/core";
import { formatNaira } from "@repo/shared/money";
import Link from "next/link";

import { Stat } from "@/components/admin/bits";
import { AdminOrderRows } from "@/components/admin/order-rows";
import { Card, Notice, PageTitle } from "@/components/ui";
import { formatDay } from "@/lib/format";
import { getServices } from "@/lib/server/services";

export default async function AdminOverviewPage() {
  const { db } = getServices();
  const [o, recent] = await Promise.all([getAdminOverview(db), listOrdersAdmin(db, { limit: 8 })]);
  const plural = (n: number, word: string) =>
    `${n.toLocaleString("en-NG")} ${word}${n === 1 ? "" : "s"}`;

  return (
    <>
      <PageTitle title="Overview" subtitle={`Today, ${formatDay(new Date())} (Lagos time)`} />

      {!o.ledgerMatches && (
        <Notice tone="bad">
          Wallet balances don’t match the ledger (off by{" "}
          {formatNaira(Math.abs(o.walletsTotalKobo - o.ledgerTotalKobo))}). Stop manual changes and
          investigate before anything else.
        </Notice>
      )}
      {o.stuckCount > 0 && (
        <Notice tone="warn">
          {plural(o.stuckCount, "order")} pending for over 24 hours.{" "}
          <Link href="/admin/orders?status=stuck" className="underline">
            Check them on VTpass and resolve
          </Link>
          .
        </Notice>
      )}

      <section aria-label="Today" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Sales today"
          value={formatNaira(o.today.salesKobo, { compact: true })}
          detail={plural(o.today.successCount, "successful order")}
          href="/admin/orders?status=success"
        />
        <Stat
          label="Funded today"
          value={formatNaira(o.today.fundedKobo, { compact: true })}
          detail={`${plural(o.today.fundingCount, "deposit")} · fees ${formatNaira(o.today.fundingFeesKobo, { compact: true })}`}
        />
        <Stat
          label="Pending orders"
          value={o.pendingCount.toLocaleString("en-NG")}
          tone={o.stuckCount > 0 ? "warn" : undefined}
          detail={o.stuckCount > 0 ? `${o.stuckCount} over 24 hours` : "Re-checked automatically"}
          href="/admin/orders?status=pending"
        />
        <Stat
          label="Failed today"
          value={o.today.failedCount.toLocaleString("en-NG")}
          tone={o.today.failedCount > 0 ? "bad" : undefined}
          detail="Refunded automatically"
          href="/admin/orders?status=failed"
        />
        <Stat
          label="Customers"
          value={o.customerCount.toLocaleString("en-NG")}
          detail={o.suspendedCount > 0 ? `${o.suspendedCount} suspended` : "None suspended"}
          href="/admin/customers"
        />
        <Stat
          label="Money in wallets"
          value={formatNaira(o.walletsTotalKobo, { compact: true })}
          tone={o.ledgerMatches ? undefined : "bad"}
          detail={
            o.ledgerMatches ? (
              <span className="text-ok">✓ Matches the ledger</span>
            ) : (
              <span className="text-bad">Doesn’t match the ledger</span>
            )
          }
        />
      </section>
      <p className="-mt-3 text-sm text-muted">
        “Money in wallets” is what customers can still spend: keep at least this much in VTpass and
        your bank.
      </p>

      <Card className="grid gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold">Latest orders</h2>
          <Link href="/admin/orders" className="text-sm font-semibold text-cobalt">
            All orders
          </Link>
        </div>
        <AdminOrderRows orders={recent.orders} empty="No orders yet." />
      </Card>
    </>
  );
}
