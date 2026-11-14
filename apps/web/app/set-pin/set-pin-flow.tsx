"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PinPad } from "@/components/pin-pad";
import { Notice } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";

export function SetPinFlow() {
  const router = useRouter();
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm(pin: string) {
    if (pin !== first) {
      setFirst(null);
      setError("The two PINs didn't match. Start again.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/auth/pin", { pin });
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setFirst(null);
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      {error && <Notice tone="bad">{error}</Notice>}
      {first === null ? (
        <PinPad
          key="first"
          label="Choose a 4-digit PIN"
          onComplete={(pin) => {
            setError(null);
            setFirst(pin);
          }}
        />
      ) : (
        <PinPad
          key="second"
          label="Enter it again to confirm"
          disabled={busy}
          onComplete={(pin) => void confirm(pin)}
        />
      )}
    </div>
  );
}
