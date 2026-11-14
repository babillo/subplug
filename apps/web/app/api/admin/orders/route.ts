// GET /api/admin/orders?status=&stuck=1&userId=&phone=&limit=&offset= — all orders; stuck=1 shows orders
// pending for over 24 hours (they need a human to check with the provider).
import { listOrdersAdmin } from "@repo/core";

import { getServices } from "@/lib/server/services";
import { isUuid, orderStatusFrom, pageFrom } from "@/lib/server/responses";
import { requireAdmin } from "@/lib/server/session";

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const result = await listOrdersAdmin(getServices().db, {
    ...pageFrom(url),
    status: orderStatusFrom(url),
    stuckOnly: url.searchParams.get("stuck") === "1",
    userId: userId && isUuid(userId) ? userId : undefined,
    phone: url.searchParams.get("phone") ?? undefined,
  });
  return Response.json(result);
}
