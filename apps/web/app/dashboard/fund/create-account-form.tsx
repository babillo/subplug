"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Notice, TextField } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";

export function CreateAccountForm() {
  const router = useRouter();
  const [kind, setKind] = useState<"bvn" | "nin">("bvn");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api("/api/wallet/funding-accounts", { [kind]: value });
          router.refresh();
        } catch (err) {
          setError((err as ApiError).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && <Notice tone="bad">{error}</Notice>}
      <div
        className="flex gap-1 justify-self-start rounded-full border border-line p-1 text-sm font-semibold"
        role="radiogroup"
        aria-label="ID type"
      >
        {(["bvn", "nin"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={`rounded-full px-3 py-1 ${kind === k ? "bg-ink text-on-ink" : "text-muted"}`}
          >
            {k.toUpperCase()}
          </button>
        ))}
      </div>
      <TextField
        id="id-number"
        label={kind === "bvn" ? "Your BVN" : "Your NIN"}
        inputMode="numeric"
        autoComplete="off"
        maxLength={11}
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
        hint="11 digits."
        required
      />
      <Button type="submit" disabled={busy || value.length !== 11}>
        {busy ? "Creating…" : "Create my account number"}
      </Button>
    </form>
  );
}
