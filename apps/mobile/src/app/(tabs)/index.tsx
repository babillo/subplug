// Home: balance, quick actions and the latest purchases. Pull down to refresh.
import type { OrderSummary } from "@repo/shared/api";
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { BalanceCard } from "@/components/balance-card";
import { OrderList } from "@/components/lists";
import { Card, Loading, Notice, Screen, T } from "@/components/ui";
import { useUser } from "@/lib/auth";
import { useColors } from "@/lib/theme";
import { useApi } from "@/lib/use-api";

export default function HomeScreen() {
  const user = useUser();
  const c = useColors();
  const wallet = useApi<{ balanceKobo: number }>("/api/wallet");
  const orders = useApi<{ orders: OrderSummary[] }>("/api/orders?limit=5");
  const firstName = user.fullName.split(" ")[0] ?? user.fullName;

  return (
    <Screen
      refreshing={wallet.refreshing || orders.refreshing}
      onRefresh={() => {
        void wallet.refresh();
        void orders.refresh();
      }}
    >
      <View style={styles.header}>
        <View>
          <T tone="muted" variant="small">
            Welcome back
          </T>
          <T variant="title">{firstName}</T>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => router.push("/settings")}
          style={[styles.avatar, { backgroundColor: c.cobaltSoft }]}
        >
          <T variant="label" tone="cobalt">
            {firstName.slice(0, 1).toUpperCase()}
          </T>
        </Pressable>
      </View>

      {user.pinLocked && (
        <Notice
          tone="bad"
          action={{ label: "Reset your PIN", onPress: () => router.push("/settings") }}
        >
          Your PIN is locked after 5 wrong tries, so purchases are paused.
        </Notice>
      )}
      {wallet.error && <Notice tone="bad">{wallet.error.message}</Notice>}

      <BalanceCard
        balanceKobo={wallet.data?.balanceKobo ?? null}
        onFund={() => router.push("/fund")}
      />

      <View style={styles.actions}>
        {[
          { label: "Buy data", glyph: "⇅", mode: "data" },
          { label: "Buy airtime", glyph: "☏", mode: "airtime" },
        ].map((a) => (
          <Pressable
            key={a.mode}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/buy", params: { mode: a.mode } })}
            style={({ pressed }) => [
              styles.action,
              { backgroundColor: c.card, borderColor: c.line, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <View style={[styles.actionIcon, { backgroundColor: c.cobaltSoft }]}>
              <T variant="heading" tone="cobalt">
                {a.glyph}
              </T>
            </View>
            <T variant="label">{a.label}</T>
          </Pressable>
        ))}
      </View>

      <Card>
        <View
          style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}
        >
          <T variant="heading">Recent</T>
          <Pressable accessibilityRole="link" onPress={() => router.push("/history")}>
            <T variant="label" tone="cobalt">
              See all
            </T>
          </Pressable>
        </View>
        {orders.data ? (
          <OrderList
            orders={orders.data.orders}
            empty="No purchases yet. Buy data or airtime above."
          />
        ) : orders.error ? (
          <T tone="muted">{orders.error.message}</T>
        ) : (
          <Loading />
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: { flexDirection: "row", gap: 12 },
  action: { flex: 1, borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
