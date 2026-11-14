// Fund the wallet by bank transfer to the customer's own account numbers (Monnify).
import type { FundingAccount } from "@repo/shared/api";
import { formatNaira } from "@repo/shared/money";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Button, Card, Field, Loading, Notice, Screen, Segmented, T } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useColors } from "@/lib/theme";
import { useApi } from "@/lib/use-api";

type Wallet = { balanceKobo: number; fundingFeeKobo: number; fundingAccounts: FundingAccount[] };

export default function FundScreen() {
  const wallet = useApi<Wallet>("/api/wallet");
  const w = wallet.data;
  return (
    <Screen refreshing={wallet.refreshing} onRefresh={() => void wallet.refresh()}>
      <View style={{ gap: 4, marginTop: 8 }}>
        <T variant="title">Fund wallet</T>
        <T tone="muted">Transfer from any Nigerian bank app to your own account number.</T>
      </View>
      {wallet.error && <Notice tone="bad">{wallet.error.message}</Notice>}
      {!w ? (
        !wallet.error && <Loading />
      ) : w.fundingAccounts.length === 0 ? (
        <CreateAccount onCreated={() => void wallet.reload()} />
      ) : (
        <>
          {w.fundingAccounts.map((a) => (
            <AccountCard key={a.accountNumber} account={a} />
          ))}
          <Card>
            <T variant="label">How it works</T>
            <T variant="small" tone="muted">
              Send any amount. It usually arrives within minutes, and your balance updates by
              itself.
            </T>
            <T variant="small" tone="muted">
              A {formatNaira(w.fundingFeeKobo, { compact: true })} fee is taken from each deposit
              (no fee on {formatNaira(w.fundingFeeKobo, { compact: true })} or less). For example,
              send ₦1,000 and {formatNaira(100_000 - w.fundingFeeKobo, { compact: true })} arrives.
            </T>
          </Card>
        </>
      )}
    </Screen>
  );
}

function AccountCard({ account }: { account: FundingAccount }) {
  const c = useColors();
  const [copied, setCopied] = useState(false);
  async function copy() {
    await Clipboard.setStringAsync(account.accountNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <Card>
      <T variant="small" tone="muted">
        {account.bankName}
      </T>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <T
          variant="money"
          selectable
          accessibilityLabel={`Account number ${account.accountNumber.split("").join(" ")}`}
        >
          {account.accountNumber}
        </T>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Copy ${account.bankName} account number`}
          onPress={() => void copy()}
          style={{
            backgroundColor: copied ? c.okSoft : c.cobaltSoft,
            borderRadius: 99,
            paddingHorizontal: 14,
            paddingVertical: 8,
          }}
        >
          <T variant="label" tone={copied ? "ok" : "cobalt"}>
            {copied ? "Copied ✓" : "Copy"}
          </T>
        </Pressable>
      </View>
      <T variant="small" tone="muted">
        Account name: {account.accountName}
      </T>
    </Card>
  );
}

function CreateAccount({ onCreated }: { onCreated: () => void }) {
  const [kind, setKind] = useState<"bvn" | "nin">("bvn");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/wallet/funding-accounts", { [kind]: value });
      onCreated();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <T variant="heading">Get your account number</T>
      <T variant="small" tone="muted">
        Banks require your BVN or NIN to open an account in your name. We pass it to our payment
        partner (Monnify) and never store it.
      </T>
      <Segmented
        label="ID type"
        value={kind}
        onChange={(k) => {
          setKind(k);
          setValue("");
        }}
        options={[
          { id: "bvn", label: "BVN" },
          { id: "nin", label: "NIN" },
        ]}
      />
      <Field
        label={kind === "bvn" ? "Your BVN (11 digits)" : "Your NIN (11 digits)"}
        keyboardType="number-pad"
        maxLength={11}
        value={value}
        onChangeText={(t) => setValue(t.replace(/\D/g, ""))}
      />
      {error && <Notice tone="bad">{error}</Notice>}
      <Button
        title="Create my account"
        onPress={() => void create()}
        disabled={value.length !== 11}
        busy={busy}
      />
    </Card>
  );
}
