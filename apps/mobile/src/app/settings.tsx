// Account details, PIN changes and sign out.
import { useState } from "react";
import { View } from "react-native";

import { PinPad } from "@/components/pin-pad";
import { Button, Card, Field, Notice, Screen, T } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth, useUser } from "@/lib/auth";

export default function SettingsScreen() {
  const user = useUser();
  const { signOut } = useAuth();
  return (
    <Screen edges={["bottom"]}>
      <Card>
        <T variant="heading">{user.fullName}</T>
        {user.phone && <T tone="muted">{user.phone}</T>}
        {user.email && <T tone="muted">{user.email}</T>}
      </Card>
      {user.pinLocked ? (
        <Card>
          <T variant="heading">Your PIN is locked</T>
          <T variant="small" tone="muted">
            After 5 wrong tries we lock purchases to protect your money. Reset your PIN with a code
            to unlock.
          </T>
          <ResetPin />
        </Card>
      ) : (
        <>
          <Card>
            <T variant="heading">Change PIN</T>
            <ChangePin />
          </Card>
          <Card>
            <T variant="heading">Forgot your PIN?</T>
            <ResetPin />
          </Card>
        </>
      )}
      <Button title="Sign out" variant="danger" onPress={() => void signOut()} />
    </Screen>
  );
}

function ChangePin() {
  const [stage, setStage] = useState<"closed" | "current" | "new" | "done">("closed");
  const [current, setCurrent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(pin: string) {
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/pin", { pin, currentPin: current });
      setStage("done");
    } catch (e) {
      const err = e as ApiError;
      setError(err.message);
      setStage(err.code === "wrong_pin" || err.code === "pin_locked" ? "current" : "new");
    } finally {
      setBusy(false);
    }
  }

  if (stage === "done") return <Notice tone="ok">Your PIN has been changed.</Notice>;
  if (stage === "closed")
    return <Button title="Change PIN" variant="secondary" onPress={() => setStage("current")} />;
  return (
    <View style={{ gap: 14 }}>
      {error && <Notice tone="bad">{error}</Notice>}
      {stage === "current" ? (
        <PinPad
          key="current"
          label="Enter your current PIN"
          onComplete={(pin) => {
            setCurrent(pin);
            setError(null);
            setStage("new");
          }}
        />
      ) : (
        <PinPad
          key="new"
          label={busy ? "Saving…" : "Now choose a new PIN"}
          disabled={busy}
          onComplete={(pin) => void save(pin)}
        />
      )}
      <Button title="Cancel" variant="ghost" onPress={() => setStage("closed")} disabled={busy} />
    </View>
  );
}

function ResetPin() {
  const { refreshUser } = useAuth();
  const [stage, setStage] = useState<"start" | "code" | "pin" | "done">("start");
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ destination: string }>("/api/auth/pin/reset-code", {});
      setSentTo(r.destination);
      setStage("code");
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function reset(pin: string) {
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/pin/reset", { code, pin });
      setStage("done");
      await refreshUser();
    } catch (e) {
      const err = e as ApiError;
      setError(err.message);
      if (!["weak_pin", "invalid_pin_format", "invalid_input"].includes(err.code)) setStage("code");
    } finally {
      setBusy(false);
    }
  }

  if (stage === "done")
    return <Notice tone="ok">Your new PIN is set and purchases are unlocked.</Notice>;
  return (
    <View style={{ gap: 14 }}>
      {error && <Notice tone="bad">{error}</Notice>}
      {stage === "start" && (
        <>
          <T variant="small" tone="muted">
            We’ll send a code to your phone or email to confirm it’s you.
          </T>
          <Button
            title="Send me a code"
            variant="secondary"
            onPress={() => void sendCode()}
            busy={busy}
          />
        </>
      )}
      {stage === "code" && (
        <>
          <Field
            label={`Code sent to ${sentTo}`}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, ""))}
          />
          <Button title="Continue" onPress={() => setStage("pin")} disabled={code.length !== 6} />
        </>
      )}
      {stage === "pin" && (
        <PinPad
          label={busy ? "Saving…" : "Choose a new PIN"}
          disabled={busy}
          onComplete={(pin) => void reset(pin)}
        />
      )}
    </View>
  );
}
