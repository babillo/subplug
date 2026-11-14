"use client";
import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="rounded-lg px-2 py-1 text-xs font-bold text-cobalt hover:bg-cobalt-soft"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard blocked: the number is selectable text, so it can be copied by hand.
        }
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
