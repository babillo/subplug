"use client";
// Admin two-step sign-in screens, shown instead of the admin panel until this session passes.
// - Not set up yet: scan a QR code into an authenticator app, confirm a code, save backup codes.
// - Set up: enter the current 6-digit code (or a backup code).
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Card, Notice, TextField } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";

export function MfaGate({ enrolled, firstName }: { enrolled: boolean; firstName: string }) {
  return (
    <div className="mx-auto grid w-full max-w-lg gap-5 py-6">
      <div className="grid gap-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          {enrolled ? "Confirm it’s you" : "Protect the admin panel"}
        </h1>
        <p className="text-muted">
          {enrolled
            ? `Hi ${firstName}. Enter the 6-digit code from your authenticator app. You’ll stay approved on this device for 12 hours.`
            : "Admin accounts can move money, so they need a second step: a code from an authenticator app on your phone, as well as the sign-in code."}
        </p>
      </div>
      {enrolled ? <Verify /> : <Setup />}
    </div>
  );
}

function Verify() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [useBackup, setUseBackup] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/mfa/verify", { code });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form className="grid gap-4" onSubmit={submit}>
        {error && <Notice tone="bad">{error}</Notice>}
        {useBackup ? (
          <TextField
            id="mfa-code"
            label="Backup code"
            placeholder="abcde-fghjk"
            autoComplete="off"
            autoCapitalize="none"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            hint="Each backup code works once."
          />
        ) : (
          <TextField
            id="mfa-code"
            label="6-digit code"
            placeholder="123456"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            className="num w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 font-display text-2xl tracking-[.4em] outline-none focus:border-cobalt"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))}
            autoFocus
          />
        )}
        <Button
          type="submit"
          disabled={
            busy || (useBackup ? code.trim().length < 10 : code.replace(/\D/g, "").length !== 6)
          }
        >
          {busy ? "Checking…" : "Continue"}
        </Button>
        <button
          type="button"
          className="justify-self-start text-sm font-semibold text-cobalt"
          onClick={() => {
            setUseBackup((b) => !b);
            setCode("");
            setError(null);
          }}
        >
          {useBackup ? "Use the app code instead" : "Lost your phone? Use a backup code"}
        </button>
      </form>
    </Card>
  );
}

type SetupData = { secret: string; uri: string; qrSvg: string };

function Setup() {
  const router = useRouter();
  const [data, setData] = useState<SetupData | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      setData(await api<SetupData>("/api/admin/mfa/setup", {}));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ recoveryCodes: string[] }>("/api/admin/mfa/confirm", { code });
      setRecoveryCodes(r.recoveryCodes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  if (recoveryCodes) {
    const text = `Admin backup codes (each works once):\n\n${recoveryCodes.join("\n")}\n`;
    return (
      <Card className="grid gap-4">
        <Notice tone="ok">Two-step sign-in is on.</Notice>
        <div className="grid gap-1">
          <h2 className="font-display text-lg font-semibold">Save your backup codes</h2>
          <p className="text-sm text-muted">
            If you lose your phone, each of these lets you in once. They won’t be shown again. Keep
            them somewhere safe, like a password manager or printed in a drawer, not in your email.
          </p>
        </div>
        <ul className="num grid grid-cols-2 gap-2 rounded-xl bg-paper p-4 font-mono text-[15px]">
          {recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(text).catch(() => undefined);
              setCopied(true);
            }}
          >
            {copied ? "Copied ✓" : "Copy all"}
          </Button>
          <a
            className="inline-flex items-center rounded-xl border border-line bg-card px-4 py-3 text-[15px] font-bold hover:bg-paper"
            href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}
            download="admin-backup-codes.txt"
          >
            Download .txt
          </a>
        </div>
        <label className="flex gap-3 text-sm">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          I’ve saved my backup codes somewhere safe.
        </label>
        <Button disabled={!saved} onClick={() => router.refresh()}>
          Continue to the admin panel
        </Button>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="grid gap-4">
        {error && <Notice tone="bad">{error}</Notice>}
        <ol className="grid list-decimal gap-2 pl-5 text-sm">
          <li>
            Install an authenticator app on your phone, e.g. Google Authenticator, Microsoft
            Authenticator or Authy (free).
          </li>
          <li>Scan the QR code we show you.</li>
          <li>Type the 6-digit code it shows, to confirm.</li>
        </ol>
        <Button onClick={() => void start()} disabled={busy}>
          {busy ? "Preparing…" : "Start setup"}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="grid gap-5">
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="grid gap-3">
        <h2 className="font-display text-lg font-semibold">
          1. Scan this with your authenticator app
        </h2>
        <div
          role="img"
          aria-label="QR code for your authenticator app"
          className="justify-self-center rounded-xl bg-white p-3 [&_svg]:size-52"
          dangerouslySetInnerHTML={{ __html: data.qrSvg }}
        />
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold text-cobalt">
            Can’t scan? Type this key instead
          </summary>
          <p className="num mt-2 rounded-xl bg-paper p-3 font-mono text-[15px] tracking-wider break-all select-all">
            {data.secret.match(/.{1,4}/g)?.join(" ")}
          </p>
          <p className="mt-2 text-muted">
            On this phone?{" "}
            <a href={data.uri} className="font-semibold text-cobalt underline">
              Open in your authenticator app
            </a>
          </p>
        </details>
      </div>
      <form className="grid gap-3" onSubmit={confirm}>
        <h2 className="font-display text-lg font-semibold">2. Enter the code it shows</h2>
        <TextField
          id="mfa-confirm"
          label="6-digit code"
          placeholder="123456"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          className="num w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-3 font-display text-2xl tracking-[.4em] outline-none focus:border-cobalt"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))}
        />
        <Button type="submit" disabled={busy || code.replace(/\D/g, "").length !== 6}>
          {busy ? "Checking…" : "Turn on two-step sign-in"}
        </Button>
      </form>
    </Card>
  );
}
