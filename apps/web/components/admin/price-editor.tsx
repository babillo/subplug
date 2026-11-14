"use client";
// Edit a product's regular and reseller prices. Data plans: a fixed naira price, checked against
// what VTpass charges us. Airtime: a discount percentage off the face value.
import { adminNairaToKobo, bpsToPercent, formatNaira, percentToBps } from "@repo/shared/money";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Notice, TextField } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";

import { Modal, NoteField } from "./modal";

type Tier = "regular" | "reseller";
const TIERS: Tier[] = ["regular", "reseller"];
const TIER_LABEL: Record<Tier, string> = { regular: "Regular customers", reseller: "Resellers" };

export interface EditableProduct {
  id: string;
  name: string;
  category: string;
  providerPriceKobo: number | null;
  prices: { tier: Tier; priceKobo: number | null; discountBps: number | null }[];
}

function koboText(kobo: number | null | undefined) {
  if (kobo === null || kobo === undefined) return "";
  return kobo % 100 === 0 ? String(kobo / 100) : (kobo / 100).toFixed(2);
}

export function PriceEditor({ product }: { product: EditableProduct }) {
  const router = useRouter();
  const isData = product.category === "data";
  const current = (tier: Tier) => product.prices.find((p) => p.tier === tier);
  const initial = (tier: Tier) =>
    isData ? koboText(current(tier)?.priceKobo) : bpsToPercent(current(tier)?.discountBps ?? 0);

  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<Tier, string>>({ regular: "", reseller: "" });
  const [note, setNote] = useState("");
  const [belowCostOk, setBelowCostOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const parse = (tier: Tier) =>
    isData ? adminNairaToKobo(values[tier]) : percentToBps(values[tier]);
  const cost = product.providerPriceKobo;
  const changedTiers = TIERS.filter((t) => values[t].trim() !== initial(t));
  // Only prices being changed need the tick; an existing below-cost price is shown in its hint.
  const belowCost =
    isData && cost !== null && changedTiers.some((t) => (parse(t) ?? Infinity) < cost);

  function start() {
    setValues({ regular: initial("regular"), reseller: initial("reseller") });
    setNote("");
    setBelowCostOk(false);
    setError(null);
    setOpen(true);
  }

  async function save() {
    const changed = changedTiers;
    if (changed.length === 0) return setOpen(false);
    for (const tier of changed) {
      if (parse(tier) === null)
        return setError(
          isData
            ? `${TIER_LABEL[tier]}: enter a price in naira, e.g. 350 or 350.50`
            : `${TIER_LABEL[tier]}: enter a discount from 0 to 99.99%`,
        );
    }
    if (belowCost && !belowCostOk) return setError("Tick the box to sell below cost.");
    setBusy(true);
    setError(null);
    try {
      for (const tier of changed) {
        await api(`/api/admin/products/${product.id}/price`, {
          tier,
          ...(isData ? { priceKobo: parse(tier) } : { discountBps: parse(tier) }),
          allowBelowCost: belowCostOk,
          note: note.trim() || undefined,
        });
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" className="!px-3 !py-1.5 text-sm" onClick={start}>
        Edit
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Prices · ${product.name}`}>
        {isData && cost !== null && (
          <p className="text-sm text-muted">
            VTpass charges us <b className="num text-fg">{formatNaira(cost)}</b>.
          </p>
        )}
        {!isData && (
          <p className="text-sm text-muted">
            Customers pay the airtime value minus this discount. Keep it below VTpass’s commission
            for this network, or you lose money on each sale.
          </p>
        )}
        {TIERS.map((tier) => {
          const parsed = parse(tier);
          const margin = isData && cost !== null && parsed !== null ? parsed - cost : null;
          return (
            <TextField
              key={tier}
              id={`price-${tier}`}
              label={isData ? `${TIER_LABEL[tier]} (₦)` : `${TIER_LABEL[tier]}: discount (%)`}
              inputMode="decimal"
              autoComplete="off"
              value={values[tier]}
              onChange={(e) => setValues((v) => ({ ...v, [tier]: e.target.value }))}
              hint={
                margin === null ? undefined : (
                  <span className={margin < 0 ? "font-semibold text-bad" : ""}>
                    {margin < 0 ? "Loss" : "Margin"} {formatNaira(Math.abs(margin))} per sale
                  </span>
                )
              }
            />
          );
        })}
        {belowCost && (
          <label className="flex gap-3 rounded-xl bg-warn-soft p-3 text-sm text-warn">
            <input
              type="checkbox"
              checked={belowCostOk}
              onChange={(e) => setBelowCostOk(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <b>Below cost.</b> I want to sell at a loss on purpose (e.g. a promo).
            </span>
          </label>
        )}
        <NoteField id="price-note" value={note} onChange={setNote} required={false} />
        {error && <Notice tone="bad">{error}</Notice>}
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save prices"}
        </Button>
      </Modal>
    </>
  );
}

/** Turns a product on or off for customers. Audited on the server. */
export function ProductToggle({
  productId,
  active,
  name,
}: {
  productId: string;
  active: boolean;
  name: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/products/${productId}/status`, { active: !active });
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn’t change it.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-grid justify-items-start gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label={`${name} on sale`}
        disabled={busy}
        onClick={toggle}
        className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${active ? "bg-ok" : "bg-line"}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${active ? "translate-x-5" : ""}`}
        />
      </button>
      {error && <span className="text-xs text-bad">{error}</span>}
    </span>
  );
}
