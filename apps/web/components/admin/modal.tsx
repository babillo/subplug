"use client";
// A centred dialog (bottom sheet on phones) built on the browser's <dialog>: Esc closes it and
// focus stays inside while it is open.
import { type ReactNode, useEffect, useRef } from "react";

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="modal-title"
      className="m-0 mt-auto w-full max-w-none rounded-t-2xl border border-line bg-card p-0 text-fg backdrop:bg-black/50 sm:m-auto sm:max-w-lg sm:rounded-2xl"
    >
      {open && (
        <div className="grid max-h-[85dvh] gap-4 overflow-y-auto p-5">
          <div className="flex items-start justify-between gap-4">
            <h2 id="modal-title" className="font-display text-lg font-semibold">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-m-1 rounded-lg p-1 text-xl leading-none text-muted hover:bg-paper"
            >
              ×
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** A labelled multi-line note box: every admin change needs a reason. */
export function NoteField({
  id,
  value,
  onChange,
  label = "Reason",
  hint = "Saved in the audit log.",
  required = true,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
        {!required && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        maxLength={500}
        aria-describedby={`${id}-hint`}
        className="w-full rounded-xl border-[1.5px] border-line bg-card px-3.5 py-2.5 text-[16px] outline-none focus:border-cobalt"
      />
      <p id={`${id}-hint`} className="text-xs text-muted">
        {hint}
      </p>
    </div>
  );
}
