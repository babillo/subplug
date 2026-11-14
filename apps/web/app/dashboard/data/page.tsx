import { getWalletStatement, listProductsForUser } from "@repo/core";
import type { Metadata } from "next";

import { BuyFlow } from "@/components/buy/buy-flow";
import { ModeSwitch } from "@/components/buy/mode-switch";
import { PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/server/current-user";
import { getServices } from "@/lib/server/services";

export const metadata: Metadata = { title: "Buy data" };

export default async function BuyDataPage() {
  const user = await requireUser();
  const { db } = getServices();
  const [products, statement] = await Promise.all([
    listProductsForUser(db, user.id),
    getWalletStatement(db, user.id, { limit: 1 }),
  ]);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle title="Buy data" subtitle="Any network, any number. Delivered in seconds." />
        <ModeSwitch current="data" />
      </div>
      <BuyFlow
        mode="data"
        products={products}
        balanceKobo={statement.balanceKobo}
        ownPhone={user.phone}
      />
    </>
  );
}
