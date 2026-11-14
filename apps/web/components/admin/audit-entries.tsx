// Audit log entries in plain words: who did what, when, why, and what changed (before → after).
import type { listAuditLog } from "@repo/core";
import { bpsToPercent, formatNaira } from "@repo/shared/money";
import Link from "next/link";

import { formatWhen } from "@/lib/format";

type Entry = Awaited<ReturnType<typeof listAuditLog>>["entries"][number];

const ACTIONS: Record<string, string> = {
  "price.update": "Changed a price",
  "product.activate": "Put a product on sale",
  "product.deactivate": "Took a product off sale",
  "user.suspend": "Suspended a customer",
  "user.activate": "Reactivated a customer",
  "user.grant_admin": "Made someone an admin",
  "user.revoke_admin": "Removed an admin",
  "order.settle": "Resolved an order by hand",
  "wallet.admin_credit": "Credited a wallet",
  "wallet.admin_debit": "Debited a wallet",
};

const FIELD_NAMES: Record<string, string> = {
  balanceKobo: "Balance",
  priceKobo: "Price",
  discountBps: "Discount",
  status: "Status",
  isActive: "On sale",
  role: "Role",
  refunded: "Refunded",
};

function show(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (key.endsWith("Kobo") && typeof value === "number") return formatNaira(value);
  if (key === "discountBps" && typeof value === "number") return `${bpsToPercent(value)}%`;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function changes(before: unknown, after: unknown) {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  return Object.keys({ ...b, ...a })
    .filter((key) => key in FIELD_NAMES)
    .filter((key) => JSON.stringify(b[key]) !== JSON.stringify(a[key]))
    .map((key) => ({
      key,
      label: FIELD_NAMES[key]!,
      before: before === null ? "(new)" : show(key, b[key]),
      after: show(key, a[key]),
    }));
}

function entityLink(entry: Entry): { href: string; label: string } | null {
  const id = entry.entityId ?? "";
  switch (entry.entityType) {
    case "user":
      return { href: `/admin/customers/${id}`, label: "View customer" };
    case "product":
      return { href: `/admin/products#p-${id}`, label: "View product" };
    case "price": {
      const [productId, tier] = id.split(":");
      return { href: `/admin/products#p-${productId}`, label: `View product (${tier} price)` };
    }
    default:
      return null;
  }
}

export function AuditEntries({ entries }: { entries: Entry[] }) {
  if (entries.length === 0)
    return <p className="py-6 text-center text-muted">Nothing recorded yet.</p>;
  return (
    <ol className="grid">
      {entries.map((e) => {
        const link = entityLink(e);
        const diff = changes(e.before, e.after);
        return (
          <li key={e.id} className="grid gap-1.5 border-b border-line py-3 text-sm last:border-b-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <b>{ACTIONS[e.action] ?? e.action}</b>
              <span className="text-xs text-muted">{formatWhen(e.createdAt)}</span>
            </div>
            <div className="text-muted">
              By {e.actorName ?? "the laptop (command line)"}
              {link && (
                <>
                  {" · "}
                  <Link href={link.href} className="font-semibold text-cobalt hover:underline">
                    {link.label}
                  </Link>
                </>
              )}
              {e.entityType === "order" && <span className="text-xs"> · Order {e.entityId}</span>}
            </div>
            {diff.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {diff.map((d) => (
                  <li key={d.key} className="num rounded-lg bg-paper px-2 py-1 text-xs">
                    {d.label}: <span className="text-muted line-through">{d.before}</span> →{" "}
                    <b>{d.after}</b>
                  </li>
                ))}
              </ul>
            )}
            {e.reason && <p className="border-l-2 border-line pl-2 text-fg">“{e.reason}”</p>}
          </li>
        );
      })}
    </ol>
  );
}
