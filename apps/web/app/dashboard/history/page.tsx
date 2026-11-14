import { getWalletStatement, listUserOrders } from "@repo/core";
import { formatNaira } from "@repo/shared/money";
import type { Metadata } from "next";
import Link from "next/link";

import { OrderList } from "@/components/order-list";
import { Card, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/server/current-user";
import { getServices } from "@/lib/server/services";

export const metadata: Metadata = { title: "History" };

const timeFormat = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const REASONS: Record<string, string> = {
  funding: "Wallet funded",
  purchase: "Purchase",
  refund: "Refund",
  admin_credit: "Credit from support",
  admin_debit: "Debit by support",
  seed: "Test credit",
};

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
      {entries.length === 0 ? (
        <p className="py-6 text-center text-muted">No transactions yet.</p>
      ) : (
        <ul className="grid">
          {entries.map((e) => (
            <li
              key={e.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-line py-2.5 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {e.description ?? REASONS[e.reason] ?? e.reason}
                </div>
                <div className="text-xs text-muted">
                  {REASONS[e.reason] ?? e.reason} · {timeFormat.format(new Date(e.createdAt))}
                </div>
              </div>
              <div className="num grid justify-items-end text-sm">
                <b className={e.direction === "credit" ? "text-ok" : ""}>
                  {e.direction === "credit" ? "+" : "−"}
                  {formatNaira(e.amountKobo)}
                </b>
                <span className="text-xs text-muted">{formatNaira(e.balanceAfterKobo)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
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
