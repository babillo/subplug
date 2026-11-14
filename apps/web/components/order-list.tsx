// Orders grouped by day (Lagos time), newest first.
import type { OrderSummary } from "@repo/core";
import { formatNaira } from "@repo/shared/money";
import { NETWORKS } from "@repo/shared/networks";
import { planSummary } from "@repo/shared/plans";

import { StatusPill } from "./ui";

const dayFormat = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  weekday: "short",
  day: "numeric",
  month: "short",
});
const timeFormat = new Intl.DateTimeFormat("en-NG", {
  timeZone: "Africa/Lagos",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" });

function dayLabel(iso: string): string {
  const key = dateKey.format(new Date(iso));
  const today = dateKey.format(new Date());
  const yesterday = dateKey.format(new Date(Date.now() - 86_400_000));
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return dayFormat.format(new Date(iso));
}

export function OrderList({ orders, empty }: { orders: OrderSummary[]; empty: React.ReactNode }) {
  if (orders.length === 0) return <div className="py-6 text-center text-muted">{empty}</div>;
  const groups: { label: string; items: OrderSummary[] }[] = [];
  for (const order of orders) {
    const label = dayLabel(order.createdAt);
    const last = groups.at(-1);
    if (last && last.label === label) last.items.push(order);
    else groups.push({ label, items: [order] });
  }
  return (
    <div className="grid gap-1">
      {groups.map((group) => (
        <div key={group.label} className="grid">
          <div className="mt-2 text-xs font-bold text-muted">{group.label}</div>
          <ul className="grid">
            {group.items.map((order) => (
              <OrderRow key={order.id} order={order} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function OrderRow({ order }: { order: OrderSummary }) {
  const network = NETWORKS.find((n) => n.id === order.network);
  const what =
    order.category === "airtime"
      ? `${formatNaira(order.faceValueKobo, { compact: true })} airtime`
      : `${planSummary(order.productName).size ?? order.productName} data`;
  return (
    <li className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line py-2.5 last:border-b-0">
      <span
        className="grid size-9 place-items-center rounded-[10px] text-[10px] font-bold"
        style={{
          background: network?.color ?? "var(--cobalt-soft)",
          color: network?.ink ?? "var(--cobalt)",
        }}
        aria-hidden
      >
        {network?.label.slice(0, 3).toUpperCase() ?? "•"}
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">
          {what} · {order.recipientPhone}
        </div>
        <div className="text-xs text-muted">{timeFormat.format(new Date(order.createdAt))}</div>
      </div>
      <div className="num grid justify-items-end gap-1 text-sm font-bold">
        {order.status === "failed" ? "₦0" : `−${formatNaira(order.amountKobo, { compact: true })}`}
        <StatusPill status={order.status} />
      </div>
    </li>
  );
}
