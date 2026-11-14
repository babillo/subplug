// Design tokens: the same colours as the web app (apps/web/app/globals.css). Change both together;
// the owner's Figma redesign replaces these values.
import { useColorScheme } from "react-native";

const light = {
  ink: "#12223b",
  cobalt: "#2557f6",
  cobaltStrong: "#1b45d6",
  cobaltSoft: "#e8eeff",
  paper: "#f6f8fc",
  card: "#ffffff",
  line: "#dde3ee",
  muted: "#5d6b82",
  fg: "#12223b",
  onInk: "#ffffff",
  ok: "#138a4b",
  okSoft: "#e3f5ea",
  warn: "#b26a00",
  warnSoft: "#fdf1dc",
  bad: "#c42b2b",
  badSoft: "#fde7e7",
};

const dark: typeof light = {
  ink: "#1b2d4b",
  cobalt: "#6d8dff",
  cobaltStrong: "#8aa3ff",
  cobaltSoft: "#1c2a52",
  paper: "#0c1424",
  card: "#121d32",
  line: "#22314d",
  muted: "#9aa8c0",
  fg: "#e8eef8",
  onInk: "#ffffff",
  ok: "#4cc883",
  okSoft: "#12301f",
  warn: "#f0b04d",
  warnSoft: "#33260d",
  bad: "#ff7a7a",
  badSoft: "#3a1717",
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}

/** Font family per weight (custom fonts need one family per weight on Android). */
export const fonts = {
  body: "Manrope_500Medium",
  bodySemibold: "Manrope_600SemiBold",
  bodyBold: "Manrope_700Bold",
  display: "PlusJakartaSans_600SemiBold",
  displayBold: "PlusJakartaSans_700Bold",
} as const;
