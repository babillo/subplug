"use client";
// Resolve an order stuck as pending, after checking its real status on the VTpass dashboard.
// "Not delivered" refunds the customer (once: the server refuses orders that aren't pending).
import { formatNaira } from "@repo/shared/money";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Notice } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";

import { Modal, NoteField } from "./modal";

export function SettleOrder({
  order,
}: {
  order: {
    id: string;
    requestId: string;
    productName: string;
    recipientPhone: string;
    amountKobo: number;
    userName: string;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<"success" | "failed" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!outcome) return setError("Choose what happened.");
    if (note.trim().length < 3)
      return setError("Say how you confirmed it (e.g. VTpass dashboard).");
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/orders/${order.id}/settle`, { outcome, note: note.trim() });
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        className="!px-3 !py-1.5 text-sm"
        onClick={() => {
          setOutcome(null);
          setNote("");
          setError(null);
          setOpen(true);
        }}
      >
        Resolve
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Resolve pending order">
        <div className="grid gap-1 rounded-xl bg-paper p-4 text-sm">
          <b>
            {order.productName} → {order.recipientPhone}
          </b>
          <span className="text-muted">
            {order.userName} paid {formatNaira(order.amountKobo)}
          </span>
          <span className="text-xs break-all text-muted">Request ID {order.requestId}</span>
        </div>
        <p className="text-sm text-muted">
          Look up the request ID on the VTpass dashboard first. Only resolve it by hand if VTpass
          has a final answer.
        </p>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold">What happened?</legend>
          {(
            [
              ["success", "Delivered", "Mark successful. No refund."],
              [
                "failed",
                "Not delivered",
                `Mark failed and refund ${formatNaira(order.amountKobo)}.`,
              ],
            ] as const
          ).map(([value, label, hint]) => (
            <label
              key={value}
              className={`flex cursor-pointer gap-3 rounded-xl border-[1.5px] p-3 ${outcome === value ? "border-cobalt bg-cobalt-soft" : "border-line"}`}
            >
              <input
                type="radio"
                name="outcome"
                value={value}
                checked={outcome === value}
                onChange={() => setOutcome(value)}
                className="mt-1 accent-[var(--cobalt)]"
              />
              <span className="grid">
                <b className="text-sm">{label}</b>
                <span className="text-sm text-muted">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <NoteField
          id="settle-note"
          label="How did you confirm it?"
          value={note}
          onChange={setNote}
        />
        {error && <Notice tone="bad">{error}</Notice>}
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </Modal>
    </>
  );
}
