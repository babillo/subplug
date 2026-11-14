// Pick the mobile network (MTN, Airtel, Glo, 9mobile). Only networks we sell are shown.
import { NETWORKS, type NetworkId } from "@repo/shared/networks";
import { Pressable, Text, View } from "react-native";

import { fonts, useColors } from "@/lib/theme";

import { T } from "./ui";

export function NetworkPicker({
  value,
  available,
  onChange,
}: {
  value: NetworkId | null;
  available: NetworkId[];
  onChange: (id: NetworkId) => void;
}) {
  const c = useColors();
  return (
    <View style={{ gap: 8 }}>
      <T variant="label">Network</T>
      <View
        accessibilityRole="radiogroup"
        style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
      >
        {NETWORKS.filter((n) => available.includes(n.id)).map((n) => {
          const active = n.id === value;
          return (
            <Pressable
              key={n.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => onChange(n.id)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                borderRadius: 99,
                borderWidth: 1.5,
                borderColor: active ? c.cobalt : c.line,
                backgroundColor: active ? c.cobaltSoft : c.card,
                paddingHorizontal: 14,
                paddingVertical: 8,
              }}
            >
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: n.color }} />
              <Text style={{ fontFamily: fonts.bodySemibold, fontSize: 15, color: c.fg }}>
                {n.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
