// The four tabs along the bottom: Home, Buy, Fund, History.
import { Tabs } from "expo-router";
import { type ColorValue, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, useColors } from "@/lib/theme";

function Icon({ glyph, color }: { glyph: string; color: ColorValue }) {
  return (
    <Text style={{ fontFamily: fonts.displayBold, fontSize: 20, color, lineHeight: 24 }}>
      {glyph}
    </Text>
  );
}

export default function TabsLayout() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.cobalt,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: {
          backgroundColor: c.card,
          borderTopColor: c.line,
          // Taller than the default so the labels fit our font; keeps the phone's bottom inset.
          height: 64 + insets.bottom,
          paddingTop: 4,
          paddingBottom: insets.bottom + 4,
        },
        tabBarLabelStyle: { fontFamily: fonts.bodyBold, fontSize: 11, lineHeight: 14 },
        sceneStyle: { backgroundColor: c.paper },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Home", tabBarIcon: ({ color }) => <Icon glyph="⌂" color={color} /> }}
      />
      <Tabs.Screen
        name="buy"
        options={{ title: "Buy", tabBarIcon: ({ color }) => <Icon glyph="⇅" color={color} /> }}
      />
      <Tabs.Screen
        name="fund"
        options={{ title: "Fund", tabBarIcon: ({ color }) => <Icon glyph="+" color={color} /> }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: "History", tabBarIcon: ({ color }) => <Icon glyph="≡" color={color} /> }}
      />
    </Tabs>
  );
}
