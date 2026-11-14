// The wallet balance on a dark card, with a show/hide eye (remembered on this phone).
import { formatNaira } from "@repo/shared/money";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { readSecure, writeSecure } from "@/lib/token-store";
import { fonts, useColors } from "@/lib/theme";

const HIDE_KEY = "hide-balance";

export function BalanceCard({
  balanceKobo,
  onFund,
}: {
  balanceKobo: number | null;
  onFund: () => void;
}) {
  const c = useColors();
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    readSecure(HIDE_KEY)
      .then((v) => setHidden(v === "1"))
      .catch(() => undefined);
  }, []);

  function toggle() {
    const next = !hidden;
    setHidden(next);
    void writeSecure(HIDE_KEY, next ? "1" : "0").catch(() => undefined);
  }

  return (
    <View style={[styles.card, { backgroundColor: c.ink }]}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: "rgba(255,255,255,0.7)" }]}>Wallet balance</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hidden ? "Show balance" : "Hide balance"}
          onPress={toggle}
          hitSlop={12}
        >
          <Text style={[styles.label, { color: "rgba(255,255,255,0.85)" }]}>
            {hidden ? "Show" : "Hide"}
          </Text>
        </Pressable>
      </View>
      <Text
        accessibilityLabel={hidden ? "Balance hidden" : undefined}
        style={{
          fontFamily: fonts.displayBold,
          fontSize: 34,
          color: "#fff",
          fontVariant: ["tabular-nums"],
        }}
      >
        {balanceKobo === null ? "…" : hidden ? "₦ ••••••" : formatNaira(balanceKobo)}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onFund}
        style={({ pressed }) => [
          styles.fund,
          { backgroundColor: c.cobalt, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={{ fontFamily: fonts.bodyBold, color: "#fff", fontSize: 15 }}>
          + Fund wallet
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, padding: 20, gap: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { fontFamily: fonts.bodySemibold, fontSize: 14 },
  fund: {
    alignSelf: "flex-start",
    borderRadius: 99,
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginTop: 4,
  },
});
