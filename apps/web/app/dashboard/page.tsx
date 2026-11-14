import { getWalletStatement, listFundingAccounts, listUserOrders } from "@repo/core";
import type { Metadata } from "next";
import Link from "next/link";

import { BalanceCard } from "@/components/balance-card";
import { OrderList } from "@/components/order-list";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/server/current-user";
import { getServices } from "@/lib/server/services";

export const metadata: Metadata = { title: "Home" };

const ACTIONS = [
  { href: "/dashboard/data", label: "Buy data", icon: "D" },
  { href: "/dashboard/airtime", label: "Airtime", icon: "A" },
  { href: "/dashboard/fund", label: "Fund wallet", icon: "+" },
  { href: "/dashboard/history", label: "History", icon: "H" },
];

export default async function DashboardHome() {
  const user = await requireUser();
  const { db } = getServices();
  const [statement, accounts, recent] = await Promise.all([
    getWalletStatement(db, user.id, { limit: 1 }),
    listFundingAccounts(db, user.id),
    listUserOrders(db, user.id, { limit: 5 }),
  ]);
  const firstName = user.fullName.split(" ")[0] ?? user.fullName;

  return (
    <>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Hi, {firstName}</h1>
      <BalanceCard
        balanceKobo={statement.balanceKobo}
        account={
          accounts[0]
            ? { bankName: accounts[0].bankName, accountNumber: accounts[0].accountNumber }
            : null
        }
      />
      <nav aria-label="Quick actions" className="grid grid-cols-4 gap-2.5">
        {ACTIONS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="grid justify-items-center gap-1.5 rounded-2xl border border-line bg-card px-1 py-3 text-center text-xs font-semibold hover:border-cobalt"
          >
            <span
              className="grid size-9 place-items-center rounded-[10px] bg-cobalt-soft font-display font-bold text-cobalt"
              aria-hidden
            >
              {a.icon}
            </span>
            {a.label}
          </Link>
        ))}
      </nav>
      <Card>
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold">Recent activity</h2>
          <Link href="/dashboard/history" className="text-sm font-semibold text-cobalt">
            See all
          </Link>
        </div>
        <OrderList
          orders={recent.orders}
          empty={
            <>
              No purchases yet.{" "}
              <Link href="/dashboard/data" className="font-semibold text-cobalt">
                Buy your first data plan
              </Link>
            </>
          }
        />
      </Card>
    </>
  );
}
