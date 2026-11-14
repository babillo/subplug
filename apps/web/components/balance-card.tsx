"use client";
// The balance, with a Hide/Show toggle remembered on this device (handy in public).
import { formatNaira } from "@repo/shared/money";
import Link from "next/link";
import { useSyncExternalStore } from "react";

const KEY = "hide-balance";
const listeners = new Set<() => void>();

function readHidden(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false; // storage blocked: default to showing
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function BalanceCard({
  balanceKobo,
  account,
}: {
  balanceKobo: number;
  account: { bankName: string; accountNumber: string } | null;
}) {
  // The server can't see this device's setting, so it renders "shown"; the browser then applies it.
  const hidden = useSyncExternalStore(subscribe, readHidden, () => false);
  const toggle = () => {
    try {
      localStorage.setItem(KEY, hidden ? "0" : "1");
    } catch {
      // ignore: the toggle just won't be remembered
    }
    listeners.forEach((l) => l());
  };
  const [naira, kobo] = formatNaira(balanceKobo).split(".");

  return (
    <section
      aria-label="Wallet balance"
      className="grid gap-4 rounded-[20px] bg-ink p-5 text-on-ink"
      style={{
        backgroundImage:
          "radial-gradient(circle at 92% 8%, rgba(255,255,255,.10) 0 70px, transparent 71px), radial-gradient(circle at 98% 0%, rgba(255,255,255,.06) 0 120px, transparent 121px)",
      }}
    >
      <div className="flex items-center justify-between text-sm opacity-85">
        <span>Wallet balance</span>
        <button
          type="button"
          onClick={toggle}
          className="rounded-full border border-white/30 px-3 py-0.5 text-xs hover:bg-white/10"
          aria-pressed={hidden}
        >
          {hidden ? "Show" : "Hide"}
        </button>
      </div>
      <div className="num font-display text-4xl font-semibold tracking-tight">
        {hidden ? (
          "₦••••••"
        ) : (
          <>
            {naira}
            <span className="text-xl opacity-80">.{kobo}</span>
          </>
        )}
      </div>
      {account ? (
        <div className="flex flex-wrap justify-between gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-sm">
          <span>Fund by transfer · {account.bankName}</span>
          <b className="num font-display tracking-wider">{account.accountNumber}</b>
        </div>
      ) : (
        <Link
          href="/dashboard/fund"
          className="rounded-xl bg-white/10 px-3 py-2.5 text-sm hover:bg-white/15"
        >
          Get your account number to fund your wallet →
        </Link>
      )}
    </section>
  );
}
