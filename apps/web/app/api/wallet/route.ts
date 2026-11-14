// GET /api/wallet — balance, the account numbers to fund it, and our flat funding fee.
import { getWalletStatement, listFundingAccounts, FUNDING_FEE_FLAT_KOBO } from "@repo/core";

import { getServices } from "@/lib/server/services";
import { getSignedInUser, unauthorized } from "@/lib/server/session";

export async function GET(request: Request) {
  const user = await getSignedInUser(request);
  if (!user) return unauthorized();
  const { db } = getServices();
  const [{ balanceKobo }, accounts] = await Promise.all([
    getWalletStatement(db, user.id, { limit: 1 }),
    listFundingAccounts(db, user.id),
  ]);
  return Response.json({
    balanceKobo,
    fundingFeeKobo: FUNDING_FEE_FLAT_KOBO,
    fundingAccounts: accounts.map(({ bankName, accountNumber, accountName }) => ({
      bankName,
      accountNumber,
      accountName,
    })),
  });
}
