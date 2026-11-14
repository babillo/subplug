"use client";
// Buying data or airtime: network → number → plan/amount → confirm with PIN → result.
// The server re-checks everything (price, balance, PIN); this screen only helps the customer.
import type { CatalogItem } from "@repo/core";
import { formatNaira, nairaToKoboInput } from "@repo/shared/money";
import { guessNetwork, NETWORKS, type NetworkId } from "@repo/shared/networks";
import { normaliseNigerianPhone } from "@repo/shared/orders";
import { PLAN_GROUPS, planGroup, type PlanGroup, planSummary } from "@repo/shared/plans";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { NetworkPicker } from "@/components/network-picker";
import { PinPad } from "@/components/pin-pad";
import { ResultView } from "@/components/result-view";
import { Button, Card, Notice, TextField } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";

const AIRTIME_PRESETS = [100, 200, 500, 1000, 2000, 5000];
const AIRTIME_MIN = 50;
const AIRTIME_MAX = 50_000;

type OrderResult = { order: { status: "pending" | "success" | "failed" }; message: string };

export function BuyFlow({
  mode,
  products,
  balanceKobo,
  ownPhone,
}: {
  mode: "data" | "airtime";
  products: CatalogItem[];
  balanceKobo: number;
  ownPhone: string | null;
}) {
  const router = useRouter();
  const forMode = products.filter((p) => p.category === mode);
  const available = NETWORKS.map((n) => n.id).filter((id) => forMode.some((p) => p.network === id));

  const [phone, setPhone] = useState("");
  /** The network the customer tapped, if any. Otherwise we follow the number's prefix. */
  const [chosenNetwork, setChosenNetwork] = useState<NetworkId | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [chosenGroup, setChosenGroup] = useState<PlanGroup | null>(null);
  const [amountText, setAmountText] = useState("");
  const [step, setStep] = useState<"form" | "confirm" | "result">("form");
  const [result, setResult] = useState<OrderResult | null>(null);
  const [error, setError] = useState<{
    message: string;
    link?: { href: string; label: string };
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [clientReference, setClientReference] = useState("");

  // Suggest the network from the number, unless the customer chose one themselves.
  const guessed = guessNetwork(phone);
  const pickedByHand = chosenNetwork !== null;
  const network: NetworkId | null =
    chosenNetwork ?? (guessed && available.includes(guessed) ? guessed : (available[0] ?? null));

  const plans = useMemo(() => forMode.filter((p) => p.network === network), [forMode, network]);
  const groups = PLAN_GROUPS.filter((g) => plans.some((p) => planGroup(p.name) === g.id));
  // Show the tab the customer picked if this network has it, else the first tab that has plans.
  const group: PlanGroup =
    chosenGroup && groups.some((g) => g.id === chosenGroup)
      ? chosenGroup
      : (groups[0]?.id ?? "daily");

  const airtimeProduct = mode === "airtime" ? plans[0] : undefined;
  const plan = mode === "data" ? plans.find((p) => p.id === planId) : undefined;
  const faceKobo =
    mode === "airtime" ? nairaToKoboInput(amountText) : (plan?.faceValueKobo ?? null);
  const costKobo =
    mode === "data"
      ? (plan?.priceKobo ?? null)
      : faceKobo !== null && airtimeProduct?.discountBps != null
        ? faceKobo - Math.floor((faceKobo * airtimeProduct.discountBps) / 10_000)
        : null;

  const normalisedPhone = normaliseNigerianPhone(phone);
  const amountError =
    mode === "airtime" &&
    amountText &&
    (faceKobo === null || faceKobo < AIRTIME_MIN * 100 || faceKobo > AIRTIME_MAX * 100)
      ? `Enter a whole amount between ₦${AIRTIME_MIN} and ₦${AIRTIME_MAX.toLocaleString("en-NG")}`
      : undefined;
  const ready = Boolean(
    normalisedPhone &&
    network &&
    costKobo !== null &&
    !amountError &&
    (mode === "airtime" ? airtimeProduct : plan),
  );
  const short = costKobo !== null && costKobo > balanceKobo;
  const productId = mode === "data" ? plan?.id : airtimeProduct?.id;
  const networkLabel = NETWORKS.find((n) => n.id === network)?.label ?? "";
  const planBits = plan ? planSummary(plan.name) : null;
  const summary =
    mode === "data"
      ? `${networkLabel} ${planBits?.size ? [planBits.size, planBits.validity].filter(Boolean).join(" · ") : (plan?.name ?? "")}`
      : `${networkLabel} airtime ${faceKobo ? formatNaira(faceKobo, { compact: true }) : ""}`;

  function startConfirm() {
    setError(null);
    setClientReference(crypto.randomUUID());
    setStep("confirm");
  }

  async function pay(pin: string) {
    if (!productId || !normalisedPhone) return;
    setBusy(true);
    setError(null);
    try {
      const response = await api<OrderResult>("/api/orders", {
        productId,
        recipientPhone: normalisedPhone,
        pin,
        clientReference,
        ...(mode === "airtime" && faceKobo ? { faceValueKobo: faceKobo } : {}),
      });
      setResult(response);
      setStep("result");
      router.refresh();
    } catch (e) {
      const err = e as ApiError;
      if (err.code === "wrong_pin") {
        setError({ message: err.message });
      } else if (err.code === "pin_locked") {
        setError({
          message: err.message,
          link: { href: "/dashboard/settings", label: "Reset your PIN" },
        });
      } else if (err.code === "insufficient_funds") {
        setError({
          message: err.message,
          link: { href: "/dashboard/fund", label: "Fund your wallet" },
        });
        setStep("form");
      } else {
        setError({ message: err.message });
        if (err.code !== "offline") setStep("form");
      }
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep("form");
    setResult(null);
    setPlanId(null);
    setAmountText("");
    setError(null);
  }

  if (step === "result" && result) {
    const titles = {
      success: "Done!",
      pending: "Processing",
      failed: "Didn't go through",
    } as const;
    return (
      <Card>
        <ResultView
          status={result.order.status}
          title={titles[result.order.status]}
          message={result.message}
          onAgain={reset}
        />
      </Card>
    );
  }

  if (step === "confirm") {
    return (
      <Card className="grid gap-5">
        <div className="grid gap-1 text-center">
          <h2 className="font-display text-lg font-semibold">Confirm purchase</h2>
          <p className="text-muted">
            {summary} to <b className="num text-fg">{normalisedPhone}</b>
          </p>
          <p className="num font-display text-2xl font-semibold">
            {costKobo !== null ? formatNaira(costKobo) : ""}
          </p>
        </div>
        {error && (
          <Notice tone="bad">
            {error.message}{" "}
            {error.link && (
              <Link href={error.link.href} className="underline">
                {error.link.label}
              </Link>
            )}
          </Notice>
        )}
        <PinPad
          disabled={busy}
          onComplete={(pin) => void pay(pin)}
          label={busy ? "Paying…" : "Enter your PIN to pay"}
          extra={
            <Link href="/dashboard/settings" className="text-xs font-semibold text-muted">
              Forgot?
            </Link>
          }
        />
        <Button variant="ghost" onClick={() => setStep("form")} disabled={busy}>
          Back
        </Button>
      </Card>
    );
  }

  if (available.length === 0) {
    return (
      <Notice>
        No {mode === "data" ? "data plans" : "airtime"} available right now. Please check back soon.
      </Notice>
    );
  }

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !short) startConfirm();
      }}
    >
      {error && (
        <Notice tone="bad">
          {error.message}{" "}
          {error.link && (
            <Link href={error.link.href} className="underline">
              {error.link.label}
            </Link>
          )}
        </Notice>
      )}
      <Card className="grid gap-5">
        <div className="grid gap-2">
          <TextField
            id="recipient"
            label="Phone number"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0803 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={
              phone.length >= 11 && !normalisedPhone
                ? "That doesn't look like a Nigerian mobile number"
                : undefined
            }
            hint={
              guessed && !pickedByHand
                ? `Looks like ${NETWORKS.find((n) => n.id === guessed)?.label}. Change it below if the number was ported.`
                : undefined
            }
          />
          {ownPhone && phone !== ownPhone && (
            <button
              type="button"
              className="justify-self-start text-sm font-semibold text-cobalt"
              onClick={() => setPhone(ownPhone)}
            >
              Buy for my number ({ownPhone})
            </button>
          )}
        </div>
        <NetworkPicker
          value={network}
          available={available}
          onChange={(n) => {
            setChosenNetwork(n);
            setPlanId(null);
          }}
        />
      </Card>

      {mode === "data" ? (
        <Card className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">Choose a plan</h2>
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Plan length">
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  role="tab"
                  aria-selected={group === g.id}
                  onClick={() => setChosenGroup(g.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${group === g.id ? "border-ink bg-ink text-on-ink" : "border-line"}`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {plans
              .filter((p) => planGroup(p.name) === group)
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={planId === p.id}
                  onClick={() => setPlanId(p.id)}
                  className={`grid gap-0.5 rounded-xl border-[1.5px] p-3 text-left ${planId === p.id ? "border-cobalt bg-cobalt-soft" : "border-line hover:border-cobalt"}`}
                >
                  <PlanCardBody name={p.name} priceKobo={p.priceKobo} />
                </button>
              ))}
          </div>
        </Card>
      ) : (
        <Card className="grid gap-4">
          <h2 className="font-display text-lg font-semibold">Amount</h2>
          <div className="grid grid-cols-3 gap-2">
            {AIRTIME_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={amountText === String(n)}
                onClick={() => setAmountText(String(n))}
                className={`num rounded-xl border-[1.5px] py-2.5 font-display font-semibold ${amountText === String(n) ? "border-cobalt bg-cobalt-soft" : "border-line hover:border-cobalt"}`}
              >
                ₦{n.toLocaleString("en-NG")}
              </button>
            ))}
          </div>
          <TextField
            id="amount"
            label="Or enter an amount (₦)"
            inputMode="numeric"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value.replace(/[^\d,]/g, ""))}
            error={amountError}
            hint={
              airtimeProduct?.discountBps &&
              costKobo !== null &&
              faceKobo !== null &&
              costKobo < faceKobo
                ? `You pay ${formatNaira(costKobo)} (${(airtimeProduct.discountBps / 100).toFixed(1)}% off).`
                : undefined
            }
          />
        </Card>
      )}

      <div className="grid gap-2">
        {short && (
          <Notice>
            Your balance ({formatNaira(balanceKobo)}) is too low for this.{" "}
            <Link href="/dashboard/fund" className="underline">
              Fund your wallet
            </Link>
          </Notice>
        )}
        <Button type="submit" disabled={!ready || short}>
          {costKobo !== null && ready
            ? `Continue · ${formatNaira(costKobo, { compact: true })}`
            : "Continue"}
        </Button>
      </div>
    </form>
  );
}

function PlanCardBody({ name, priceKobo }: { name: string; priceKobo: number | null }) {
  const { size, validity } = planSummary(name);
  return (
    <>
      <span className="font-display text-lg leading-tight font-semibold">{size ?? name}</span>
      {validity && <span className="text-xs text-muted">{validity}</span>}
      <span className="num text-sm font-bold">
        {priceKobo !== null ? formatNaira(priceKobo, { compact: true }) : ""}
      </span>
      {size && <span className="line-clamp-2 text-[11px] text-muted">{name}</span>}
    </>
  );
}
