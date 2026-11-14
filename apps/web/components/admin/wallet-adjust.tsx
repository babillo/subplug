"use client";
// Manual wallet credit/debit. Two steps (fill in → review → confirm) so the amount is read twice.
// The one-time key is made when the dialog opens: a double-click or retry can't move money twice.
import { adminNairaToKobo, formatNaira } from "@repo/shared/money";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Notice, TextField } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";

import { Modal, NoteField } from "./modal";

export function WalletAdjust({
  userId,
  customerName,
  balanceKobo,
}: {
  userId: string;
  customerName: string;
  balanceKobo: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [step, setStep] = useState<"form" | "review">("form");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const amountKobo = adminNairaToKobo(amount);
  const after =
    amountKobo === null ? null : balanceKobo + (direction === "credit" ? amountKobo : -amountKobo);

  function start(dir: "credit" | "debit") {
    setDirection(dir);
    setAmount("");
    setNote("");
    setStep("form");
    setError(null);
    setDone(null);
    setKey(crypto.randomUUID());
    setOpen(true);
  }

  function review() {
    if (amountKobo === null) return setError("Enter an amount in naira, e.g. 1500 or 1500.50");
    if (after !== null && after < 0)
      return setError(`That's more than the balance (${formatNaira(balanceKobo)}).`);
    if (note.trim().length < 3) return setError("Add a short reason.");
    setError(null);
    setStep("review");
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ duplicate: boolean; entry: { balanceAfterKobo: number } }>(
        `/api/admin/users/${userId}/wallet`,
        { direction, amountKobo, note: note.trim(), idempotencyKey: key },
      );
      setDone(
        `${direction === "credit" ? "Credited" : "Debited"} ${formatNaira(amountKobo!)}. New balance ${formatNaira(result.entry.balanceAfterKobo)}.`,
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
      setStep("form");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => start("credit")}>Credit wallet</Button>
        <Button variant="secondary" onClick={() => start("debit")}>
          Debit wallet
        </Button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${direction === "credit" ? "Credit" : "Debit"} ${customerName}’s wallet`}
      >
        {done ? (
          <>
            <Notice tone="ok">{done}</Notice>
            <Button onClick={() => setOpen(false)}>Done</Button>
          </>
        ) : step === "form" ? (
          <>
            <p className="text-sm text-muted">
              Balance now: <b className="num text-fg">{formatNaira(balanceKobo)}</b>
            </p>
            <TextField
              id="adjust-amount"
              label="Amount (₦)"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
            <NoteField
              id="adjust-note"
              value={note}
              onChange={setNote}
              hint="Saved in the audit log and shown on the customer’s statement."
            />
            {error && <Notice tone="bad">{error}</Notice>}
            <Button onClick={review}>Review</Button>
          </>
        ) : (
          <>
            <div className="grid gap-2 rounded-xl bg-paper p-4 text-sm">
              <Row label={direction === "credit" ? "Add" : "Take away"}>
                <b className={direction === "credit" ? "text-ok" : "text-bad"}>
                  {direction === "credit" ? "+" : "−"}
                  {formatNaira(amountKobo!)}
                </b>
              </Row>
              <Row label="Balance now">{formatNaira(balanceKobo)}</Row>
              <Row label="Balance after">
                <b>{formatNaira(after!)}</b>
              </Row>
              <Row label="Reason">{note.trim()}</Row>
            </div>
            {error && <Notice tone="bad">{error}</Notice>}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setStep("form")} disabled={busy}>
                Back
              </Button>
              <Button onClick={confirm} disabled={busy}>
                {busy ? "Saving…" : `Confirm ${direction}`}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted">{label}</span>
      <span className="num text-right">{children}</span>
    </div>
  );
}
