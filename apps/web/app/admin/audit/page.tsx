import { listAuditLog } from "@repo/core";
import type { Metadata } from "next";

import { AuditEntries } from "@/components/admin/audit-entries";
import { FilterTabs, ShowMore } from "@/components/admin/bits";
import { Card, PageTitle } from "@/components/ui";
import { getServices } from "@/lib/server/services";

export const metadata: Metadata = { title: "Audit log" };

const FILTERS = [
  { id: "all", label: "Everything" },
  { id: "wallet", label: "Wallet credits/debits" },
  { id: "price", label: "Prices" },
  { id: "product", label: "Products" },
  { id: "order", label: "Orders" },
  { id: "user", label: "Customers" },
] as const;

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; show?: string }>;
}) {
  const params = await searchParams;
  const type = FILTERS.some((f) => f.id === params.type) ? params.type! : "all";
  const limit = Math.min(200, Math.max(30, Number(params.show) || 30));
  const { entries, hasMore } = await listAuditLog(getServices().db, {
    entityType: type === "all" ? undefined : type,
    limit,
  });

  return (
    <>
      <PageTitle
        title="Audit log"
        subtitle="Every admin change, with who made it, why, and the values before and after. The app has no way to edit or delete entries."
      />
      <FilterTabs
        label="Kind of change"
        current={type}
        items={FILTERS.map((f) => ({
          id: f.id,
          label: f.label,
          href: f.id === "all" ? "/admin/audit" : `/admin/audit?type=${f.id}`,
        }))}
      />
      <Card>
        <AuditEntries entries={entries} />
        {hasMore && (
          <ShowMore
            href={`/admin/audit?${new URLSearchParams({ ...(type !== "all" ? { type } : {}), show: String(limit + 30) })}`}
          />
        )}
      </Card>
    </>
  );
}
