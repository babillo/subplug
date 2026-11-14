// Small building blocks shared by every screen. Colours come only from the theme tokens.
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextProps,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { fonts, useColors } from "@/lib/theme";

/** A scrolling screen with the paper background; optional pull-to-refresh. */
export function Screen({
  children,
  refreshing,
  onRefresh,
  edges = ["top"],
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  edges?: ("top" | "bottom")[];
}) {
  const c = useColors();
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.paper }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.screen}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.muted} />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type Variant = "body" | "small" | "label" | "title" | "heading" | "money" | "caption";

export function T({
  variant = "body",
  tone,
  style,
  ...props
}: TextProps & { variant?: Variant; tone?: "muted" | "ok" | "warn" | "bad" | "cobalt" | "onInk" }) {
  const c = useColors();
  const base = {
    body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22 },
    small: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
    caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
    label: { fontFamily: fonts.bodySemibold, fontSize: 14, lineHeight: 20 },
    heading: { fontFamily: fonts.display, fontSize: 18, lineHeight: 24 },
    title: { fontFamily: fonts.displayBold, fontSize: 26, lineHeight: 32, letterSpacing: -0.4 },
    money: {
      fontFamily: fonts.displayBold,
      fontSize: 30,
      lineHeight: 36,
      fontVariant: ["tabular-nums" as const],
    },
  }[variant];
  const color = tone ? c[tone] : c.fg;
  return <Text {...props} style={[base, { color }, style]} />;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  busy,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  busy?: boolean;
  style?: ViewStyle;
}) {
  const c = useColors();
  const look = {
    primary: { bg: c.cobalt, fg: "#ffffff", border: c.cobalt },
    secondary: { bg: c.card, fg: c.fg, border: c.line },
    ghost: { bg: "transparent", fg: c.cobalt, border: "transparent" },
    danger: { bg: c.badSoft, fg: c.bad, border: c.badSoft },
  }[variant];
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: look.bg,
          borderColor: look.border,
          opacity: off ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={look.fg} /> : null}
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: look.fg }}>{title}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  error,
  style,
  ...props
}: TextInputProps & { label: string; hint?: string; error?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      <T variant="label">{label}</T>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.muted}
        {...props}
        style={[
          styles.input,
          { borderColor: error ? c.bad : c.line, backgroundColor: c.card, color: c.fg },
          style,
        ]}
      />
      {error ? (
        <T variant="small" tone="bad">
          {error}
        </T>
      ) : hint ? (
        <T variant="small" tone="muted">
          {hint}
        </T>
      ) : null}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }, style]}>
      {children}
    </View>
  );
}

export function Notice({
  tone = "warn",
  children,
  action,
}: {
  tone?: "warn" | "bad" | "ok";
  children: ReactNode;
  action?: { label: string; onPress: () => void };
}) {
  const c = useColors();
  const bg = { warn: c.warnSoft, bad: c.badSoft, ok: c.okSoft }[tone];
  return (
    <View
      accessibilityRole={tone === "bad" ? "alert" : "summary"}
      style={[styles.notice, { backgroundColor: bg }]}
    >
      <T variant="label" tone={tone}>
        {children}
      </T>
      {action && (
        <Pressable accessibilityRole="link" onPress={action.onPress}>
          <T variant="label" tone={tone} style={{ textDecorationLine: "underline" }}>
            {action.label}
          </T>
        </Pressable>
      )}
    </View>
  );
}

export function StatusPill({ status }: { status: "pending" | "success" | "failed" }) {
  const c = useColors();
  const [label, fg, bg] = {
    success: ["Delivered", c.ok, c.okSoft],
    pending: ["Processing", c.warn, c.warnSoft],
    failed: ["Refunded", c.bad, c.badSoft],
  }[status];
  return (
    <View
      style={{ backgroundColor: bg, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}
    >
      <Text style={{ color: fg, fontFamily: fonts.bodyBold, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

/** Two or more options in a pill-shaped switch (Data / Airtime, Purchases / Statement). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  const c = useColors();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={[styles.segmented, { backgroundColor: c.card, borderColor: c.line }]}
    >
      {options.map((o) => {
        const active = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.id)}
            style={[styles.segment, active && { backgroundColor: c.ink }]}
          >
            <Text
              style={{
                fontFamily: fonts.bodySemibold,
                fontSize: 14,
                color: active ? c.onInk : c.muted,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Loading() {
  const c = useColors();
  return <ActivityIndicator style={{ paddingVertical: 32 }} color={c.muted} />;
}

const styles = StyleSheet.create({
  screen: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
  button: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    fontFamily: fonts.body,
  },
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
  notice: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 6 },
  segmented: {
    flexDirection: "row",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 99,
    padding: 4,
    gap: 4,
  },
  segment: { borderRadius: 99, paddingHorizontal: 14, paddingVertical: 6 },
});
