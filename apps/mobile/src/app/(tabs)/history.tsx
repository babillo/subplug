// Past purchases and the wallet statement (every naira in and out).
import type { OrderSummary, StatementEntry } from "@repo/shared/api";
import { formatNaira } from "@repo/shared/money";
import { useState } from "react";
import { View } from "react-native";

import { OrderList, StatementList } from "@/components/lists";
import { Button, Card, Loading, Notice, Screen, Segmented, T } from "@/components/ui";
import { useApi } from "@/lib/use-api";

type Tab = "orders" | "statement";

export default function HistoryScreen() {
  const [tab, setTab] = useState<Tab>("orders");
  const [limit, setLimit] = useState(20);
  const orders = useApi<{ orders: OrderSummary[]; hasMore: boolean }>(`/api/orders?limit=${limit}`);
  const statement = useApi<{ balanceKobo: number; entries: StatementEntry[]; hasMore: boolean }>(
    `/api/wallet/transactions?limit=${limit}`,
  );
  const current = tab === "orders" ? orders : statement;

  return (
    <Screen refreshing={current.refreshing} onRefresh={() => void current.refresh()}>
      <T variant="title" style={{ marginTop: 8 }}>
        History
      </T>
      <Segmented
        label="History views"
        value={tab}
        onChange={(t) => {
          setTab(t);
          setLimit(20);
        }}
        options={[
          { id: "orders", label: "Purchases" },
          { id: "statement", label: "Wallet statement" },
        ]}
      />
      {current.error && <Notice tone="bad">{current.error.message}</Notice>}
      <Card>
        {tab === "orders" ? (
          orders.data ? (
            <OrderList orders={orders.data.orders} empty="No purchases yet." />
          ) : (
            <Loading />
          )
        ) : statement.data ? (
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <T variant="small" tone="muted">
                Balance now
              </T>
              <T variant="label">{formatNaira(statement.data.balanceKobo)}</T>
            </View>
            <StatementList entries={statement.data.entries} />
          </>
        ) : (
          <Loading />
        )}
      </Card>
      {(tab === "orders" ? orders.data?.hasMore : statement.data?.hasMore) && (
        <Button
          title="Show more"
          variant="ghost"
          onPress={() => setLimit((n) => Math.min(100, n + 20))}
        />
      )}
    </Screen>
  );
}
