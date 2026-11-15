"use client";
// Settings → Appearance: System (follow the device), Light or Dark. Saved on this device.
import { useSyncExternalStore } from "react";

type Theme = "system" | "light" | "dark";
const KEY = "theme";
const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function save(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Storage blocked (private mode): the choice still applies until the page is closed.
  }
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

const OPTIONS: { id: Theme; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

export function ThemePicker() {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);
  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className="flex gap-1 justify-self-start rounded-full border border-line bg-paper p-1 text-sm font-semibold"
    >
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={theme === o.id}
          onClick={() => save(o.id)}
          className={`rounded-full px-3.5 py-1.5 ${theme === o.id ? "bg-ink text-on-ink" : "text-muted hover:text-fg"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
