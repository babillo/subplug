"use client";
// System page: "Check Monnify connection" signs in to Monnify once and shows the result.
import { useState } from "react";

import { Button, Notice } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";

type Result = { ok: boolean; colo: string | null; ms: number; error?: string };

export function MonnifyCheck() {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    try {
      setResult(await api<Result>("/api/admin/system/monnify-check", {}));
    } catch (e) {
      setResult({
        ok: false,
        colo: null,
        ms: 0,
        error: e instanceof ApiError ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  const where = result?.colo ? ` (Cloudflare ${result.colo})` : "";
  return (
    <div className="grid gap-2">
      <Button
        variant="secondary"
        className="justify-self-start"
        onClick={() => void check()}
        disabled={busy}
      >
        {busy ? "Checking…" : "Check Monnify connection"}
      </Button>
      {result &&
        (result.ok ? (
          <Notice tone="ok">
            Monnify sign-in works{where}, {result.ms} ms.
          </Notice>
        ) : (
          <Notice tone="bad">
            Monnify sign-in failed{where}: {result.error}
          </Notice>
        ))}
    </div>
  );
}
