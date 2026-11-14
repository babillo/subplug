import { listOrdersAdmin } from "@repo/core";
import type { Metadata } from "next";

import { FilterTabs, ShowMore } from "@/components/admin/bits";
import { AdminOrderRows } from "@/components/admin/order-rows";
import { Button, Card, PageTitle } from "@/components/ui";
import { getServices } from "@/lib/server/services";

export const metadata: Metadata = { title: "Orders" };

const FILTERS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "stuck", label: "Stuck > 24h" },
  { id: "success", label: "Success" },
  { id: "failed", label: "Failed" },
] as const;

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; phone?: string; show?: string }>;
}) {
  const params = await searchParams;
  const status = FILTERS.some((f) => f.id === params.status) ? params.status! : "all";
  const phone = (params.phone ?? "").replace(/\D/g, "").slice(0, 15);
  const limit = Math.min(200, Math.max(30, Number(params.show) || 30));
  const query = (extra: Record<string, string>) =>
    `/admin/orders?${new URLSearchParams({
      ...(status !== "all" ? { status } : {}),
      ...(phone ? { phone } : {}),
      ...extra,
    })}`;

  const { orders, hasMore } = await listOrdersAdmin(getServices().db, {
    limit,
    status:
      status === "pending" || status === "success" || status === "failed" ? status : undefined,
    stuckOnly: status === "stuck",
    phone: phone || undefined,
  });

  return (
    <>
      <PageTitle
        title="Orders"
        subtitle="Pending orders are re-checked with VTpass automatically. Resolve by hand only when VTpass has a final answer."
      />
      <div className="flex flex-wrap items-center gap-3">
        <FilterTabs
          label="Order status"
          current={status}
          items={FILTERS.map((f) => ({
            id: f.id,
            label: f.label,
            href: `/admin/orders?${new URLSearchParams({ ...(f.id !== "all" ? { status: f.id } : {}), ...(phone ? { phone } : {}) })}`,
          }))}
        />
        <form action="/admin/orders" className="flex min-w-0 flex-1 gap-2 sm:max-w-xs">
          {status !== "all" && <input type="hidden" name="status" value={status} />}
          <label htmlFor="order-phone" className="sr-only">
            Phone number
          </label>
          <input
            id="order-phone"
            name="phone"
            type="search"
            inputMode="tel"
            defaultValue={phone}
            placeholder="Search phone number"
            className="min-w-0 flex-1 rounded-xl border-[1.5px] border-line bg-card px-3 py-2 text-[16px] outline-none focus:border-cobalt"
          />
          <Button type="submit" variant="secondary" className="!py-2">
            Search
          </Button>
        </form>
      </div>
      <Card>
        <AdminOrderRows
          orders={orders}
          empty={phone ? `No orders to numbers containing ${phone}.` : "No orders here."}
        />
        {hasMore && <ShowMore href={query({ show: String(limit + 30) })} />}
      </Card>
    </>
  );
}
