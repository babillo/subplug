"use client";
// Suspend (signs the customer out everywhere and blocks purchases) or reactivate an account.
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Notice } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";

import { Modal, NoteField } from "./modal";

export function UserStatusAction({
  userId,
  customerName,
  status,
}: {
  userId: string;
  customerName: string;
  status: "active" | "suspended";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = status === "active" ? "suspended" : "active";

  async function save() {
    if (note.trim().length < 3) return setError("Add a short reason.");
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/users/${userId}/status`, { status: next, note: note.trim() });
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
        variant={next === "suspended" ? "danger" : "secondary"}
        onClick={() => {
          setNote("");
          setError(null);
          setOpen(true);
        }}
      >
        {next === "suspended" ? "Suspend account" : "Reactivate account"}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={next === "suspended" ? `Suspend ${customerName}?` : `Reactivate ${customerName}?`}
      >
        <p className="text-sm text-muted">
          {next === "suspended"
            ? "They’ll be signed out on every device and can’t sign in or buy until you reactivate them. Their wallet balance stays as it is."
            : "They’ll be able to sign in and buy again."}
        </p>
        <NoteField id="status-note" value={note} onChange={setNote} />
        {error && <Notice tone="bad">{error}</Notice>}
        <Button
          variant={next === "suspended" ? "danger" : "primary"}
          onClick={save}
          disabled={busy}
        >
          {busy ? "Saving…" : next === "suspended" ? "Suspend" : "Reactivate"}
        </Button>
      </Modal>
    </>
  );
}
