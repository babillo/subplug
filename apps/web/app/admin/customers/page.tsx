import { listUsers } from "@repo/core";
import { formatNaira } from "@repo/shared/money";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge, ShowMore } from "@/components/admin/bits";
import { Button, Card, PageTitle } from "@/components/ui";
import { formatDay } from "@/lib/format";
import { getServices } from "@/lib/server/services";

export const metadata: Metadata = { title: "Customers" };

const COLS = "md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_8rem_7rem_7rem]";

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; show?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 100);
  const limit = Math.min(200, Math.max(30, Number(params.show) || 30));
  const { users, hasMore } = await listUsers(getServices().db, { search: q || undefined, limit });

  return (
    <>
      <PageTitle title="Customers" />
      <form action="/admin/customers" className="flex gap-2 sm:max-w-md" role="search">
        <label htmlFor="customer-search" className="sr-only">
          Search customers
        </label>
        <input
          id="customer-search"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Name, phone or email"
          className="min-w-0 flex-1 rounded-xl border-[1.5px] border-line bg-card px-3 py-2 text-[16px] outline-none focus:border-cobalt"
        />
        <Button type="submit" variant="secondary" className="!py-2">
          Search
        </Button>
      </form>
      <Card>
        {users.length === 0 ? (
          <p className="py-6 text-center text-muted">
            {q ? `No customers match “${q}”.` : "No customers yet."}
          </p>
        ) : (
          <div role="table" aria-label="Customers" className="grid text-sm">
            <div
              role="row"
              className={`hidden gap-3 border-b border-line pb-2 text-xs font-bold tracking-wide text-muted uppercase md:grid ${COLS}`}
            >
              <span role="columnheader">Name</span>
              <span role="columnheader">Contact</span>
              <span role="columnheader" className="text-right">
                Balance
              </span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Joined</span>
            </div>
            {users.map((u) => (
              <Link
                role="row"
                key={u.id}
                href={`/admin/customers/${u.id}`}
                className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-b border-line py-3 last:border-b-0 hover:bg-paper md:items-center ${COLS}`}
              >
                <span role="cell" className="truncate font-semibold">
                  {u.fullName}
                  {u.role === "admin" && (
                    <span className="ml-2 align-middle">
                      <Badge tone="cobalt">Admin</Badge>
                    </span>
                  )}
                </span>
                <span role="cell" className="order-3 min-w-0 truncate text-muted md:order-none">
                  {[u.phone, u.email].filter(Boolean).join(" · ")}
                </span>
                <span role="cell" className="num order-2 text-right font-semibold md:order-none">
                  {formatNaira(u.balanceKobo)}
                </span>
                <span role="cell" className="order-4 md:order-none">
                  {u.status === "suspended" ? (
                    <Badge tone="bad">Suspended</Badge>
                  ) : (
                    <Badge tone="ok">Active</Badge>
                  )}
                  {u.tier === "reseller" && (
                    <span className="ml-1">
                      <Badge>Reseller</Badge>
                    </span>
                  )}
                </span>
                <span role="cell" className="order-5 hidden text-muted md:order-none md:block">
                  {formatDay(u.createdAt)}
                </span>
              </Link>
            ))}
          </div>
        )}
        {hasMore && (
          <ShowMore
            href={`/admin/customers?${new URLSearchParams({ ...(q ? { q } : {}), show: String(limit + 30) })}`}
          />
        )}
      </Card>
    </>
  );
}
