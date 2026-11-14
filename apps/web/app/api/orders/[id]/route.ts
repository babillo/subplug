// GET /api/orders/:id — one of the signed-in customer's orders.
import { getUserOrder } from "@repo/core";

import { getServices } from "@/lib/server/services";
import { getSignedInUser, unauthorized } from "@/lib/server/session";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSignedInUser(request);
  if (!user) return unauthorized();
  const { id } = await context.params;
  const order = await getUserOrder(getServices().db, user.id, id);
  return order
    ? Response.json({ order })
    : Response.json({ error: { code: "not_found", message: "Order not found." } }, { status: 404 });
}
