import { getWalletStatement, listUserOrders } from "@repo/core";
import { formatNaira } from "@repo/shared/money";
import type { Metadata } from "next";
import Link from "next/link";

import { OrderList } from "@/components/order-list";
import { StatementList } from "@/components/statement-list";
import { Card, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/server/current-user";
import { getServices } from "@/lib/server/services";

export const metadata: Metadata = { title: "History" };

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; show?: string }>;
}) {
  const user = await requireUser();
  const { tab = "orders", show } = await searchParams;
  const limit = Math.min(100, Math.max(20, Number(show) || 20));
  const { db } = getServices();

  return (
    <>
      <PageTitle title="History" />
      <nav
        aria-label="History views"
        className="flex gap-1 justify-self-start rounded-full border border-line bg-card p-1 text-sm font-semibold"
      >
        {[
          ["orders", "Purchases"],
          ["statement", "Wallet statement"],
        ].map(([id, label]) => (
          <Link
            key={id}
            href={`/dashboard/history?tab=${id}`}
            aria-current={tab === id ? "page" : undefined}
            className={`rounded-full px-3 py-1 ${tab === id ? "bg-ink text-on-ink" : "text-muted"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <Card>
        {tab === "statement" ? (
          <Statement userId={user.id} limit={limit} db={db} />
        ) : (
          <Orders userId={user.id} limit={limit} db={db} />
        )}
      </Card>
    </>
  );
}

type Db = ReturnType<typeof getServices>["db"];

async function Orders({ userId, limit, db }: { userId: string; limit: number; db: Db }) {
  const { orders, hasMore } = await listUserOrders(db, userId, { limit });
  return (
    <>
      <OrderList orders={orders} empty="No purchases yet." />
      {hasMore && <MoreLink tab="orders" limit={limit} />}
    </>
  );
}

async function Statement({ userId, limit, db }: { userId: string; limit: number; db: Db }) {
  const { balanceKobo, entries, hasMore } = await getWalletStatement(db, userId, { limit });
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between border-b border-line pb-2 text-sm">
        <span className="text-muted">Balance now</span>
        <b className="num font-display text-lg">{formatNaira(balanceKobo)}</b>
      </div>
      <StatementList entries={entries} />
      {hasMore && <MoreLink tab="statement" limit={limit} />}
    </div>
  );
}

function MoreLink({ tab, limit }: { tab: string; limit: number }) {
  return (
    <Link
      href={`/dashboard/history?tab=${tab}&show=${limit + 20}`}
      className="mt-3 block text-center text-sm font-semibold text-cobalt"
    >
      Show more
    </Link>
  );
}
