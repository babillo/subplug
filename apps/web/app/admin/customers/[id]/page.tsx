import { getUserDetail, getWalletStatement, listAuditLog, listOrdersAdmin } from "@repo/core";
import { formatNaira } from "@repo/shared/money";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AuditEntries } from "@/components/admin/audit-entries";
import { Badge, FilterTabs, ShowMore } from "@/components/admin/bits";
import { AdminOrderRows } from "@/components/admin/order-rows";
import { UserStatusAction } from "@/components/admin/user-status";
import { WalletAdjust } from "@/components/admin/wallet-adjust";
import { StatementList } from "@/components/statement-list";
import { Card } from "@/components/ui";
import { formatDay } from "@/lib/format";
import { getCurrentUser } from "@/lib/server/current-user";
import { getServices } from "@/lib/server/services";

export const metadata: Metadata = { title: "Customer" };

const TABS = [
  { id: "orders", label: "Orders" },
  { id: "statement", label: "Wallet statement" },
  { id: "audit", label: "Admin changes" },
] as const;

export default async function AdminCustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; show?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam, show } = await searchParams;
  const tab = TABS.some((t) => t.id === tabParam) ? tabParam! : "orders";
  const limit = Math.min(200, Math.max(20, Number(show) || 20));
  const { db } = getServices();

  const [user, admin] = await Promise.all([getUserDetail(db, id), getCurrentUser()]);
  if (!user) notFound();
  const firstName = user.fullName.split(" ")[0] ?? user.fullName;

  return (
    <>
      <div className="grid gap-2">
        <Link href="/admin/customers" className="text-sm font-semibold text-cobalt">
          ← Customers
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            {user.fullName}
          </h1>
          {user.status === "suspended" ? (
            <Badge tone="bad">Suspended</Badge>
          ) : (
            <Badge tone="ok">Active</Badge>
          )}
          {user.role === "admin" && <Badge tone="cobalt">Admin</Badge>}
          {user.tier === "reseller" && <Badge>Reseller</Badge>}
          {user.pinLocked && <Badge tone="warn">PIN locked</Badge>}
          {!user.hasPin && <Badge>No PIN yet</Badge>}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="grid content-start gap-4">
          <div className="grid gap-1">
            <span className="text-sm font-semibold text-muted">Wallet balance</span>
            <span className="num font-display text-3xl font-semibold tracking-tight">
              {formatNaira(user.balanceKobo)}
            </span>
          </div>
          <WalletAdjust userId={user.id} customerName={firstName} balanceKobo={user.balanceKobo} />
          {admin?.id !== user.id && (
            <div className="border-t border-line pt-4">
              <UserStatusAction userId={user.id} customerName={firstName} status={user.status} />
            </div>
          )}
        </Card>
        <Card className="grid content-start gap-3 text-sm">
          <Detail label="Phone">
            {user.phone ?? "—"} {user.phoneVerifiedAt && <Badge tone="ok">Verified</Badge>}
          </Detail>
          <Detail label="Email">
            <span className="break-all">{user.email ?? "—"}</span>{" "}
            {user.emailVerifiedAt && <Badge tone="ok">Verified</Badge>}
          </Detail>
          <Detail label="Joined">{formatDay(user.createdAt)}</Detail>
          <Detail label="Orders">{user.orderCount.toLocaleString("en-NG")}</Detail>
          <Detail label="Funding accounts">
            {user.fundingAccounts.length === 0 ? (
              "None yet"
            ) : (
              <ul className="grid gap-0.5">
                {user.fundingAccounts.map((a) => (
                  <li key={a.accountNumber} className="num">
                    {a.bankName} · {a.accountNumber}
                  </li>
                ))}
              </ul>
            )}
          </Detail>
        </Card>
      </div>

      <FilterTabs
        label="Customer records"
        current={tab}
        items={TABS.map((t) => ({
          id: t.id,
          label: t.label,
          href: `/admin/customers/${id}?tab=${t.id}`,
        }))}
      />
      <Card>
        {tab === "orders" && <Orders userId={id} limit={limit} />}
        {tab === "statement" && <Statement userId={id} limit={limit} />}
        {tab === "audit" && <Audit userId={id} walletId={user.walletId} limit={limit} />}
      </Card>
    </>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3">
      <span className="text-muted">{label}</span>
      <span>{children}</span>
    </div>
  );
}

const more = (userId: string, tab: string, limit: number) =>
  `/admin/customers/${userId}?tab=${tab}&show=${limit + 20}`;

async function Orders({ userId, limit }: { userId: string; limit: number }) {
  const { orders, hasMore } = await listOrdersAdmin(getServices().db, { userId, limit });
  return (
    <>
      <AdminOrderRows orders={orders} empty="No orders yet." showCustomer={false} />
      {hasMore && <ShowMore href={more(userId, "orders", limit)} />}
    </>
  );
}

async function Statement({ userId, limit }: { userId: string; limit: number }) {
  const { entries, hasMore } = await getWalletStatement(getServices().db, userId, { limit });
  return (
    <>
      <StatementList entries={entries} />
      {hasMore && <ShowMore href={more(userId, "statement", limit)} />}
    </>
  );
}

/** Admin changes to this customer: their account (suspensions) and their wallet (credits/debits). */
async function Audit({
  userId,
  walletId,
  limit,
}: {
  userId: string;
  walletId: string | null;
  limit: number;
}) {
  const { db } = getServices();
  const [userLog, walletLog] = await Promise.all([
    listAuditLog(db, { entityType: "user", entityId: userId, limit }),
    walletId
      ? listAuditLog(db, { entityType: "wallet", entityId: walletId, limit })
      : { entries: [], hasMore: false },
  ]);
  const entries = [...userLog.entries, ...walletLog.entries]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, limit);
  return (
    <>
      <AuditEntries entries={entries} />
      {(userLog.hasMore || walletLog.hasMore) && <ShowMore href={more(userId, "audit", limit)} />}
    </>
  );
}
