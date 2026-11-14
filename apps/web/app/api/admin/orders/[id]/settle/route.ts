// POST /api/admin/orders/:id/settle — settle a stuck pending order by hand (audited).
// Body: { outcome: "success" | "failed", note }. "failed" refunds the customer once.
import { settleOrderManually } from "@repo/core";

import { getServices } from "@/lib/server/services";
import { badRequest, errorResponse, isUuid, readJson, str } from "@/lib/server/responses";
import { requireAdmin } from "@/lib/server/session";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const { id } = await context.params;
  const body = await readJson(request);
  const outcome = body?.outcome;
  if (!isUuid(id) || (outcome !== "success" && outcome !== "failed")) {
    return badRequest(
      "Send outcome (success or failed) and a note explaining how you confirmed it",
    );
  }
  try {
    const order = await settleOrderManually(getServices().db, {
      adminId: admin.id,
      orderId: id,
      outcome,
      note: str(body?.note) ?? "",
    });
    return Response.json({
      order: { id: order.id, status: order.status, refundedAt: order.refundedAt },
    });
  } catch (error) {
    return errorResponse(error, "POST /api/admin/orders/:id/settle");
  }
}
