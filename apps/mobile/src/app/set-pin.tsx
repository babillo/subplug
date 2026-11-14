// Choose the 4-digit transaction PIN (asked for on every purchase). Entered twice to confirm.
import { useState } from "react";
import { View } from "react-native";

import { PinPad } from "@/components/pin-pad";
import { Button, Card, Notice, Screen, T } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function SetPinScreen() {
  const { refreshUser, signOut } = useAuth();
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm(pin: string) {
    if (pin !== first) {
      setFirst(null);
      return setError("The PINs didn’t match. Choose your PIN again.");
    }
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/pin", { pin });
      await refreshUser();
    } catch (e) {
      setFirst(null);
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ gap: 6, marginTop: 32 }}>
        <T variant="title">Set your PIN</T>
        <T tone="muted">
          You’ll enter it to approve every purchase. Avoid 1234 or your birth year.
        </T>
      </View>
      {error && <Notice tone="bad">{error}</Notice>}
      <Card style={{ paddingVertical: 24 }}>
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
            key="confirm"
            label={busy ? "Saving…" : "Enter it again to confirm"}
            disabled={busy}
            onComplete={(pin) => void confirm(pin)}
          />
        )}
      </Card>
      <Button title="Sign out" variant="ghost" onPress={() => void signOut()} />
    </Screen>
  );
}
