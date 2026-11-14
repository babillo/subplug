// GET /api/products — what the signed-in customer can buy, at their own price.
import { listProductsForUser } from "@repo/core";

import { getServices } from "@/lib/server/services";
import { getSignedInUser, unauthorized } from "@/lib/server/session";

export async function GET(request: Request) {
  const user = await getSignedInUser(request);
  if (!user) return unauthorized();
  return Response.json({ products: await listProductsForUser(getServices().db, user.id) });
}
