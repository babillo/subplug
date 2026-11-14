// Orders and wallet statement rows.
import type { OrderSummary, StatementEntry } from "@repo/shared/api";
import { formatNaira } from "@repo/shared/money";
import { NETWORKS } from "@repo/shared/networks";
import { planSummary } from "@repo/shared/plans";
import { StyleSheet, View } from "react-native";

import { formatWhen, LEDGER_REASONS } from "@/lib/format";
import { useColors } from "@/lib/theme";

import { StatusPill, T } from "./ui";

function orderTitle(o: OrderSummary) {
  const network = NETWORKS.find((n) => n.id === o.network)?.label ?? o.network.toUpperCase();
  if (o.category === "airtime")
    return `${network} airtime ${formatNaira(o.faceValueKobo, { compact: true })}`;
  const { size, validity } = planSummary(o.productName);
  return size ? `${network} ${[size, validity].filter(Boolean).join(" · ")}` : o.productName;
}

export function OrderList({ orders, empty }: { orders: OrderSummary[]; empty: string }) {
  const c = useColors();
  if (orders.length === 0)
    return (
      <T tone="muted" style={{ textAlign: "center", paddingVertical: 20 }}>
        {empty}
      </T>
    );
  return (
    <View>
      {orders.map((o, i) => (
        <View
          key={o.id}
          accessible
          style={[
            styles.row,
            i < orders.length - 1 && { borderBottomWidth: 1, borderColor: c.line },
          ]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="label" numberOfLines={1}>
              {orderTitle(o)}
            </T>
            <T variant="caption" tone="muted">
              {o.recipientPhone} · {formatWhen(o.createdAt)}
            </T>
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <T variant="label" style={{ fontVariant: ["tabular-nums"] }}>
              {formatNaira(o.amountKobo)}
            </T>
            <StatusPill status={o.status} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function StatementList({ entries }: { entries: StatementEntry[] }) {
  const c = useColors();
  if (entries.length === 0)
    return (
      <T tone="muted" style={{ textAlign: "center", paddingVertical: 20 }}>
        No transactions yet.
      </T>
    );
  return (
    <View>
      {entries.map((e, i) => (
        <View
          key={e.id}
          accessible
          style={[
            styles.row,
            i < entries.length - 1 && { borderBottomWidth: 1, borderColor: c.line },
          ]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="label" numberOfLines={1}>
              {e.description ?? LEDGER_REASONS[e.reason] ?? e.reason}
            </T>
            <T variant="caption" tone="muted">
              {LEDGER_REASONS[e.reason] ?? e.reason} · {formatWhen(e.createdAt)}
            </T>
          </View>
          <View style={{ alignItems: "flex-end", gap: 2 }}>
            <T
              variant="label"
              tone={e.direction === "credit" ? "ok" : undefined}
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {e.direction === "credit" ? "+" : "−"}
              {formatNaira(e.amountKobo)}
            </T>
            <T variant="caption" tone="muted" style={{ fontVariant: ["tabular-nums"] }}>
              {formatNaira(e.balanceAfterKobo)}
            </T>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
});
