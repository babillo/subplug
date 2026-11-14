"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PinPad } from "@/components/pin-pad";
import { Button, Notice, TextField } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";

export function ChangePin() {
  const [current, setCurrent] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="secondary" className="justify-self-start" onClick={() => setOpen(true)}>
        Change PIN
      </Button>
    );
  }
  return (
    <div className="grid gap-4">
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {current === null ? (
        <PinPad
          key="current"
          label="Enter your current PIN"
          onComplete={(pin) => {
            setMessage(null);
            setCurrent(pin);
          }}
        />
      ) : (
        <PinPad
          key="new"
          label="Now choose a new PIN"
          disabled={busy}
          onComplete={async (pin) => {
            setBusy(true);
            try {
              await api("/api/auth/pin", { pin, currentPin: current });
              setMessage({ tone: "ok", text: "PIN changed." });
              setOpen(false);
            } catch (e) {
              setMessage({ tone: "bad", text: (e as ApiError).message });
            } finally {
              setCurrent(null);
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}

export function ResetPin() {
  const router = useRouter();
  const [stage, setStage] = useState<"start" | "code" | "pin" | "done">("start");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (stage === "done")
    return <Notice tone="ok">Your new PIN is set and purchases are unlocked.</Notice>;

  return (
    <div className="grid gap-4">
      {error && <Notice tone="bad">{error}</Notice>}
      {stage === "start" && (
        <Button
          variant="secondary"
          className="justify-self-start"
          disabled={busy}
          onClick={async () => {
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
          }}
        >
          {busy ? "Sending…" : "Send me a reset code"}
        </Button>
      )}
      {stage === "code" && (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setStage("pin");
          }}
        >
          <TextField
            id="reset-code"
            label={`Code sent to ${sentTo}`}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <Button type="submit" disabled={code.length !== 6}>
            Continue
          </Button>
        </form>
      )}
      {stage === "pin" && (
        <PinPad
          label="Choose a new PIN"
          disabled={busy}
          onComplete={async (pin) => {
            setBusy(true);
            setError(null);
            try {
              await api("/api/auth/pin/reset", { code, pin });
              setStage("done");
              router.refresh();
            } catch (e) {
              const err = e as ApiError;
              setError(err.message);
              setStage(err.code === "invalid_code" ? "code" : "pin");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}

export function SignOut() {
  const router = useRouter();
  return (
    <Button
      variant="danger"
      className="justify-self-start"
      onClick={async () => {
        await api("/api/auth/sign-out", {}).catch(() => undefined);
        router.replace("/sign-in");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
