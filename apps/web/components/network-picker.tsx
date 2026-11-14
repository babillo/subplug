"use client";
import { NETWORKS, type NetworkId } from "@repo/shared/networks";

export function NetworkPicker({
  value,
  onChange,
  available,
}: {
  value: NetworkId | null;
  onChange: (network: NetworkId) => void;
  /** Networks that have products; others are shown disabled. */
  available: NetworkId[];
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1.5 text-sm font-semibold">Network</legend>
      <div className="grid grid-cols-4 gap-2">
        {NETWORKS.map((n) => {
          const on = value === n.id;
          const enabled = available.includes(n.id);
          return (
            <button
              key={n.id}
              type="button"
              disabled={!enabled}
              aria-pressed={on}
              onClick={() => onChange(n.id)}
              className={`grid justify-items-center gap-1.5 rounded-xl border-[1.5px] px-1 py-2.5 text-xs font-semibold transition-colors disabled:opacity-35 ${on ? "border-cobalt bg-cobalt-soft" : "border-line bg-card hover:border-cobalt"}`}
            >
              <span className="size-5 rounded-full" style={{ background: n.color }} />
              {n.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
