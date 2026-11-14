// A 4-digit PIN entry: dots plus a number pad. Calls onComplete with the PIN on the 4th digit.
// Changing `resetKey` clears it (e.g. after a wrong PIN).
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { fonts, useColors } from "@/lib/theme";

import { T } from "./ui";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

export function PinPad({
  label,
  onComplete,
  disabled,
}: {
  label: string;
  onComplete: (pin: string) => void;
  disabled?: boolean;
}) {
  const c = useColors();
  const [pin, setPin] = useState("");

  function press(key: string) {
    if (disabled) return;
    if (key === "⌫") return setPin((p) => p.slice(0, -1));
    if (!key || pin.length >= 4) return;
    const next = pin + key;
    setPin(next);
    if (next.length === 4) {
      onComplete(next);
      setPin("");
    }
  }

  return (
    <View style={{ gap: 18, alignItems: "center" }}>
      <T variant="label" tone="muted">
        {label}
      </T>
      <View
        accessible
        accessibilityLabel={`${pin.length} of 4 digits entered`}
        style={{ flexDirection: "row", gap: 16 }}
      >
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { borderColor: c.ink },
              i < pin.length && { backgroundColor: c.ink },
            ]}
          />
        ))}
      </View>
      <View style={styles.grid}>
        {KEYS.map((key, i) =>
          key ? (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={key === "⌫" ? "Delete" : key}
              onPress={() => press(key)}
              disabled={disabled}
              style={({ pressed }) => [
                styles.key,
                { backgroundColor: pressed ? c.line : key === "⌫" ? "transparent" : c.paper },
              ]}
            >
              <Text style={{ fontFamily: fonts.display, fontSize: 26, color: c.fg }}>{key}</Text>
            </Pressable>
          ) : (
            <View key={i} style={styles.key} />
          ),
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", width: 276, gap: 12, justifyContent: "center" },
  key: { width: 80, height: 62, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});
