// Buying data or airtime: number → network → plan/amount → confirm with PIN → result.
// The server re-checks everything (price, balance, PIN); this screen only helps the customer.
import type { CatalogItem, OrderResult } from "@repo/shared/api";
import { formatNaira, nairaToKoboInput } from "@repo/shared/money";
import { guessNetwork, NETWORKS, type NetworkId } from "@repo/shared/networks";
import { airtimeCostKobo, normaliseNigerianPhone } from "@repo/shared/orders";
import { PLAN_GROUPS, planGroup, type PlanGroup, planSummary } from "@repo/shared/plans";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { NetworkPicker } from "@/components/network-picker";
import { PinPad } from "@/components/pin-pad";
import { Button, Card, Field, Loading, Notice, Screen, Segmented, T } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { useUser } from "@/lib/auth";
import { newClientReference } from "@/lib/reference";
import { fonts, useColors } from "@/lib/theme";
import { useApi } from "@/lib/use-api";

type Mode = "data" | "airtime";
const AIRTIME_PRESETS = [100, 200, 500, 1000, 2000, 5000];
const AIRTIME_MIN = 50;
const AIRTIME_MAX = 50_000;

export default function BuyScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode: Mode = params.mode === "airtime" ? "airtime" : "data";
  const products = useApi<{ products: CatalogItem[] }>("/api/products");
  const wallet = useApi<{ balanceKobo: number }>("/api/wallet");

  return (
    <Screen
      refreshing={products.refreshing}
      onRefresh={() => {
        void products.refresh();
        void wallet.refresh();
      }}
    >
      <T variant="title" style={{ marginTop: 8 }}>
        Buy
      </T>
      <Segmented
        label="What to buy"
        value={mode}
        onChange={(m) => router.setParams({ mode: m })}
        options={[
          { id: "data", label: "Data" },
          { id: "airtime", label: "Airtime" },
        ]}
      />
      {products.error && <Notice tone="bad">{products.error.message}</Notice>}
      {products.data && wallet.data ? (
        <BuyFlow
          key={mode}
          mode={mode}
          products={products.data.products}
          balanceKobo={wallet.data.balanceKobo}
          onBought={() => void wallet.reload()}
        />
      ) : (
        !products.error && <Loading />
      )}
    </Screen>
  );
}

type ErrorState = { message: string; action?: { label: string; onPress: () => void } } | null;

function BuyFlow({
  mode,
  products,
  balanceKobo,
  onBought,
}: {
  mode: Mode;
  products: CatalogItem[];
  balanceKobo: number;
  onBought: () => void;
}) {
  const c = useColors();
  const user = useUser();
  const forMode = products.filter((p) => p.category === mode);
  const available = NETWORKS.map((n) => n.id).filter((id) => forMode.some((p) => p.network === id));

  const [phone, setPhone] = useState("");
  const [chosenNetwork, setChosenNetwork] = useState<NetworkId | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [chosenGroup, setChosenGroup] = useState<PlanGroup | null>(null);
  const [amountText, setAmountText] = useState("");
  const [step, setStep] = useState<"form" | "confirm" | "result">("form");
  const [result, setResult] = useState<OrderResult | null>(null);
  const [error, setError] = useState<ErrorState>(null);
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState("");

  // Suggest the network from the number, unless the customer chose one themselves.
  const guessed = guessNetwork(phone);
  const network: NetworkId | null =
    chosenNetwork ?? (guessed && available.includes(guessed) ? guessed : (available[0] ?? null));
  const plans = forMode.filter((p) => p.network === network);
  const groups = PLAN_GROUPS.filter((g) => plans.some((p) => planGroup(p.name) === g.id));
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
        ? airtimeCostKobo(faceKobo, airtimeProduct.discountBps)
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
  const bits = plan ? planSummary(plan.name) : null;
  const summary =
    mode === "data"
      ? `${networkLabel} ${bits?.size ? [bits.size, bits.validity].filter(Boolean).join(" · ") : (plan?.name ?? "")}`
      : `${networkLabel} airtime ${faceKobo ? formatNaira(faceKobo, { compact: true }) : ""}`;

  const toFund = { label: "Fund your wallet", onPress: () => router.push("/fund") };
  const toSettings = { label: "Reset your PIN", onPress: () => router.push("/settings") };

  async function pay(pin: string) {
    if (!productId || !normalisedPhone) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<OrderResult>("/api/orders", {
        productId,
        recipientPhone: normalisedPhone,
        pin,
        clientReference: reference,
        ...(mode === "airtime" && faceKobo ? { faceValueKobo: faceKobo } : {}),
      });
      setResult(r);
      setStep("result");
      onBought();
    } catch (e) {
      const err = e as ApiError;
      if (err.code === "wrong_pin") setError({ message: err.message });
      else if (err.code === "pin_locked") setError({ message: err.message, action: toSettings });
      else if (err.code === "insufficient_funds") {
        setError({ message: err.message, action: toFund });
        setStep("form");
      } else {
        setError({ message: err.message });
        if (err.code !== "offline") setStep("form");
      }
    } finally {
      setBusy(false);
    }
  }

  function again() {
    setStep("form");
    setResult(null);
    setPlanId(null);
    setAmountText("");
    setError(null);
  }

  if (step === "result" && result) {
    const look = {
      success: ["✓", "Done!", c.ok, c.okSoft],
      pending: ["…", "Processing", c.warn, c.warnSoft],
      failed: ["!", "Didn’t go through", c.bad, c.badSoft],
    }[result.order.status];
    return (
      <Card style={{ alignItems: "center", paddingVertical: 28 }}>
        <View accessibilityRole="summary" style={[styles.badge, { backgroundColor: look[3] }]}>
          <Text style={{ fontFamily: fonts.displayBold, fontSize: 30, color: look[2] }}>
            {look[0]}
          </Text>
        </View>
        <T variant="heading">{look[1]}</T>
        <T tone="muted" style={{ textAlign: "center" }}>
          {result.message}
        </T>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
          <Button title="Buy again" onPress={again} />
          <Button title="History" variant="ghost" onPress={() => router.push("/history")} />
        </View>
      </Card>
    );
  }

  if (step === "confirm") {
    return (
      <Card style={{ paddingVertical: 22, gap: 18 }}>
        <View style={{ alignItems: "center", gap: 4 }}>
          <T variant="heading">Confirm purchase</T>
          <T tone="muted" style={{ textAlign: "center" }}>
            {summary} to <T variant="label">{normalisedPhone}</T>
          </T>
          <T variant="money">{costKobo !== null ? formatNaira(costKobo) : ""}</T>
        </View>
        {error && (
          <Notice tone="bad" action={error.action}>
            {error.message}
          </Notice>
        )}
        <PinPad
          label={busy ? "Paying…" : "Enter your PIN to pay"}
          disabled={busy}
          onComplete={(pin) => void pay(pin)}
        />
        <Button title="Back" variant="ghost" onPress={() => setStep("form")} disabled={busy} />
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
    <>
      {error && (
        <Notice tone="bad" action={error.action}>
          {error.message}
        </Notice>
      )}
      <Card>
        <Field
          label="Phone number"
          placeholder="0803 123 4567"
          keyboardType="phone-pad"
          autoComplete="tel"
          value={phone}
          onChangeText={setPhone}
          error={
            phone.replace(/\D/g, "").length >= 11 && !normalisedPhone
              ? "That doesn’t look like a Nigerian mobile number"
              : undefined
          }
          hint={
            guessed && chosenNetwork === null
              ? `Looks like ${NETWORKS.find((n) => n.id === guessed)?.label}. Change it below if the number was ported.`
              : undefined
          }
        />
        {user.phone && phone !== user.phone && (
          <Pressable accessibilityRole="button" onPress={() => setPhone(user.phone!)}>
            <T variant="label" tone="cobalt">
              Buy for my number ({user.phone})
            </T>
          </Pressable>
        )}
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
        <Card>
          <T variant="heading">Choose a plan</T>
          <Segmented
            label="Plan length"
            value={group}
            onChange={setChosenGroup}
            options={groups.map((g) => ({ id: g.id, label: g.label }))}
          />
          <View style={styles.plans}>
            {plans
              .filter((p) => planGroup(p.name) === group)
              .map((p) => {
                const { size, validity } = planSummary(p.name);
                const active = planId === p.id;
                return (
                  <Pressable
                    key={p.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={`${p.name}, ${p.priceKobo !== null ? formatNaira(p.priceKobo, { compact: true }) : ""}`}
                    onPress={() => setPlanId(p.id)}
                    style={[
                      styles.plan,
                      {
                        borderColor: active ? c.cobalt : c.line,
                        backgroundColor: active ? c.cobaltSoft : c.card,
                      },
                    ]}
                  >
                    <T variant="heading">{size ?? p.name}</T>
                    {validity ? (
                      <T variant="caption" tone="muted">
                        {validity}
                      </T>
                    ) : null}
                    <T variant="label">
                      {p.priceKobo !== null ? formatNaira(p.priceKobo, { compact: true }) : ""}
                    </T>
                  </Pressable>
                );
              })}
          </View>
        </Card>
      ) : (
        <Card>
          <T variant="heading">Amount</T>
          <View style={styles.presets}>
            {AIRTIME_PRESETS.map((n) => {
              const active = amountText === String(n);
              return (
                <Pressable
                  key={n}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  onPress={() => setAmountText(String(n))}
                  style={[
                    styles.preset,
                    {
                      borderColor: active ? c.cobalt : c.line,
                      backgroundColor: active ? c.cobaltSoft : c.card,
                    },
                  ]}
                >
                  <T variant="label">₦{n.toLocaleString("en-NG")}</T>
                </Pressable>
              );
            })}
          </View>
          <Field
            label="Or enter an amount (₦)"
            keyboardType="number-pad"
            value={amountText}
            onChangeText={(t) => setAmountText(t.replace(/[^\d,]/g, ""))}
            error={amountError || undefined}
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

      {short && (
        <Notice action={toFund}>
          Your balance ({formatNaira(balanceKobo)}) is too low for this.
        </Notice>
      )}
      <Button
        title={
          costKobo !== null && ready
            ? `Continue · ${formatNaira(costKobo, { compact: true })}`
            : "Continue"
        }
        disabled={!ready || short}
        onPress={() => {
          setError(null);
          setReference(newClientReference());
          setStep("confirm");
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  plans: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  plan: { width: "47.5%", flexGrow: 1, borderWidth: 1.5, borderRadius: 14, padding: 12, gap: 2 },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  preset: {
    width: "30%",
    flexGrow: 1,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
});
