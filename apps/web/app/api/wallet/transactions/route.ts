// GET /api/wallet/transactions?limit=&offset= — the wallet statement, newest first.
import { getWalletStatement } from "@repo/core";

import { getServices } from "@/lib/server/services";
import { pageFrom } from "@/lib/server/responses";
import { getSignedInUser, unauthorized } from "@/lib/server/session";

export async function GET(request: Request) {
  const user = await getSignedInUser(request);
  if (!user) return unauthorized();
  const statement = await getWalletStatement(
    getServices().db,
    user.id,
    pageFrom(new URL(request.url)),
  );
  return Response.json(statement);
}
