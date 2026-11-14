"use client";
// 4-digit PIN entry: big tap targets on phones, number keys and Backspace on a keyboard.
// The PIN is only held in memory until onComplete hands it over; nothing is stored.
import { useCallback, useEffect, useState } from "react";

export function PinPad({
  onComplete,
  disabled = false,
  label = "Enter your 4-digit PIN",
  extra,
}: {
  onComplete: (pin: string) => void;
  disabled?: boolean;
  label?: string;
  extra?: React.ReactNode;
}) {
  const [pin, setPin] = useState("");

  const press = useCallback(
    (key: string) => {
      if (disabled) return;
      setPin((current) => {
        if (key === "back") return current.slice(0, -1);
        if (current.length >= 4) return current;
        const next = current + key;
        if (next.length === 4) {
          // Hand over after the 4th dot is drawn, then clear for the next attempt.
          setTimeout(() => {
            onComplete(next);
            setPin("");
          }, 120);
        }
        return next;
      });
    },
    [disabled, onComplete],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (/^\d$/.test(event.key)) press(event.key);
      else if (event.key === "Backspace") press("back");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  return (
    <div className="grid justify-items-center gap-5">
      <p className="text-sm text-muted">{label}</p>
      <div className="flex gap-4" role="status" aria-label={`${pin.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`size-3.5 rounded-full border-2 border-cobalt ${i < pin.length ? "bg-cobalt" : ""}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((key) => (
          <PadKey key={key} onClick={() => press(key)} disabled={disabled}>
            {key}
          </PadKey>
        ))}
        <div className="grid place-items-center">{extra}</div>
        <PadKey onClick={() => press("0")} disabled={disabled}>
          0
        </PadKey>
        <PadKey onClick={() => press("back")} disabled={disabled} label="Delete last digit" ghost>
          ⌫
        </PadKey>
      </div>
    </div>
  );
}

function PadKey({
  children,
  onClick,
  disabled,
  label,
  ghost,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  label?: string;
  ghost?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`h-14 w-[72px] rounded-2xl font-display text-xl font-semibold transition-colors disabled:opacity-40 ${ghost ? "text-muted hover:bg-paper" : "bg-paper hover:bg-cobalt-soft"}`}
    >
      {children}
    </button>
  );
}
