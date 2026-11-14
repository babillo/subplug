// A wallet's ledger entries: what moved, why, and the balance after each one.
import type { StatementEntry } from "@repo/core";
import { formatNaira } from "@repo/shared/money";

import { formatWhen, LEDGER_REASONS } from "@/lib/format";

export function StatementList({ entries }: { entries: StatementEntry[] }) {
  if (entries.length === 0)
    return <p className="py-6 text-center text-muted">No transactions yet.</p>;
  return (
    <ul className="grid">
      {entries.map((e) => (
        <li
          key={e.id}
          className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-line py-2.5 last:border-b-0"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {e.description ?? LEDGER_REASONS[e.reason] ?? e.reason}
            </div>
            <div className="text-xs text-muted">
              {LEDGER_REASONS[e.reason] ?? e.reason} · {formatWhen(e.createdAt)}
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
  );
}
