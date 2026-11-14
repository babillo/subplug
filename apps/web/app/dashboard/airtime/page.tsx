import { getWalletStatement, listProductsForUser } from "@repo/core";
import type { Metadata } from "next";

import { BuyFlow } from "@/components/buy/buy-flow";
import { ModeSwitch } from "@/components/buy/mode-switch";
import { PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/server/current-user";
import { getServices } from "@/lib/server/services";

export const metadata: Metadata = { title: "Buy airtime" };

export default async function BuyAirtimePage() {
  const user = await requireUser();
  const { db } = getServices();
  const [products, statement] = await Promise.all([
    listProductsForUser(db, user.id),
    getWalletStatement(db, user.id, { limit: 1 }),
  ]);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle
          title="Buy airtime"
          subtitle="Top up any number. Discount applied automatically."
        />
        <ModeSwitch current="airtime" />
      </div>
      <BuyFlow
        mode="airtime"
        products={products}
        balanceKobo={statement.balanceKobo}
        ownPhone={user.phone}
      />
    </>
  );
}
