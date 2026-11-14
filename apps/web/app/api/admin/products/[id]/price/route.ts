// POST /api/admin/products/:id/price — change a tier's price (audited with before/after).
// Body: { tier, priceKobo (data) | discountBps (airtime), allowBelowCost?, note? }
import { updatePrice } from "@repo/core";

import { getServices } from "@/lib/server/services";
import { badRequest, errorResponse, isUuid, readJson, str } from "@/lib/server/responses";
import { requireAdmin } from "@/lib/server/session";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const { id } = await context.params;
  const body = await readJson(request);
  const tier = body?.tier;
  if (!isUuid(id) || (tier !== "regular" && tier !== "reseller")) {
    return badRequest("Send tier (regular or reseller) and priceKobo or discountBps");
  }
  const num = (value: unknown) => (typeof value === "number" ? value : undefined);
  try {
    const price = await updatePrice(getServices().db, {
      adminId: admin.id,
      productId: id,
      tier,
      priceKobo: num(body?.priceKobo),
      discountBps: num(body?.discountBps),
      allowBelowCost: body?.allowBelowCost === true,
      note: str(body?.note),
    });
    return Response.json({
      price: { tier: price.tier, priceKobo: price.priceKobo, discountBps: price.discountBps },
    });
  } catch (error) {
    return errorResponse(error, "POST /api/admin/products/:id/price");
  }
}
