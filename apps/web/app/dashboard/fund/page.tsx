import { FUNDING_FEE_FLAT_KOBO, listFundingAccounts } from "@repo/core";
import { formatNaira } from "@repo/shared/money";
import type { Metadata } from "next";

import { Card, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/server/current-user";
import { getServices } from "@/lib/server/services";

import { AccountCards } from "./account-cards";
import { CreateAccountForm } from "./create-account-form";

export const metadata: Metadata = { title: "Fund wallet" };

export default async function FundPage() {
  const user = await requireUser();
  const accounts = await listFundingAccounts(getServices().db, user.id);
  const fee = formatNaira(FUNDING_FEE_FLAT_KOBO, { compact: true });

  return (
    <>
      <PageTitle
        title="Fund your wallet"
        subtitle="Transfer from any Nigerian bank app to your own account number."
      />
      {accounts.length > 0 ? (
        <>
          <AccountCards accounts={accounts} />
          <Card className="grid gap-2 text-sm text-muted">
            <p>Send any amount. It usually arrives within minutes.</p>
            <p>
              A {fee} fee is taken from each deposit (no fee on {fee} or less). For example, send
              ₦5,000 and ₦4,950 is added to your wallet.
            </p>
          </Card>
        </>
      ) : (
        <Card className="grid gap-4">
          <div className="grid gap-1">
            <h2 className="font-display text-lg font-semibold">Get your account number</h2>
            <p className="text-sm text-muted">
              Our bank partner needs your BVN or NIN to open an account number in your name. We pass
              it on and never store it.
            </p>
          </div>
          <CreateAccountForm />
        </Card>
      )}
    </>
  );
}
