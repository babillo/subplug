// Orders as rows: a table-like grid on laptops, stacked cards on phones.
import type { listOrdersAdmin } from "@repo/core";
import { formatNaira } from "@repo/shared/money";
import Link from "next/link";

import { formatWhen } from "@/lib/format";

import { OrderStatusBadge } from "./bits";
import { SettleOrder } from "./settle-order";

type AdminOrder = Awaited<ReturnType<typeof listOrdersAdmin>>["orders"][number];

const COLS = "md:grid-cols-[8.5rem_minmax(0,1.6fr)_7.5rem_6.5rem_8.5rem_5.5rem]";

export function AdminOrderRows({
  orders,
  empty,
  showCustomer = true,
}: {
  orders: AdminOrder[];
  empty: string;
  showCustomer?: boolean;
}) {
  if (orders.length === 0) return <p className="py-6 text-center text-muted">{empty}</p>;
  return (
    <div role="table" aria-label="Orders" className="grid text-sm">
      <div
        role="row"
        className={`hidden gap-3 border-b border-line pb-2 text-xs font-bold tracking-wide text-muted uppercase md:grid ${COLS}`}
      >
        <span role="columnheader">Time</span>
        <span role="columnheader">{showCustomer ? "Customer · product" : "Product"}</span>
        <span role="columnheader">Phone</span>
        <span role="columnheader" className="text-right">
          Paid
        </span>
        <span role="columnheader">Status</span>
        <span role="columnheader">
          <span className="sr-only">Action</span>
        </span>
      </div>
      {orders.map((o) => (
        <div
          role="row"
          key={o.id}
          className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-b border-line py-3 last:border-b-0 md:items-center ${COLS}`}
        >
          <span role="cell" className="order-3 text-xs text-muted md:order-none md:text-sm">
            {formatWhen(o.createdAt)}
          </span>
          <span role="cell" className="order-1 min-w-0 md:order-none">
            <span className="block truncate font-semibold">{o.productName}</span>
            {showCustomer && (
              <Link
                href={`/admin/customers/${o.userId}`}
                className="block truncate text-muted hover:text-cobalt hover:underline"
              >
                {o.userName}
              </Link>
            )}
            {o.status !== "success" && o.providerMessage && (
              <span className="block truncate text-xs text-muted" title={o.providerMessage}>
                {o.providerCode ? `${o.providerCode}: ` : ""}
                {o.providerMessage}
              </span>
            )}
          </span>
          <span
            role="cell"
            className="num order-4 text-xs text-muted md:order-none md:text-sm md:text-fg"
          >
            {o.recipientPhone}
          </span>
          <span role="cell" className="num order-2 text-right font-semibold md:order-none">
            {formatNaira(o.amountKobo)}
          </span>
          <span role="cell" className="order-5 md:order-none">
            <OrderStatusBadge status={o.status} refunded={o.refundedAt !== null} />
          </span>
          <span role="cell" className="order-6 justify-self-end md:order-none">
            {o.status === "pending" && <SettleOrder order={o} />}
          </span>
        </div>
      ))}
    </div>
  );
}
