// POST /api/admin/products/:id/status — turn a product on or off (audited). Body: { active, note? }
import { setProductActive } from "@repo/core";

import { getServices } from "@/lib/server/services";
import { badRequest, errorResponse, isUuid, readJson, str } from "@/lib/server/responses";
import { requireAdmin } from "@/lib/server/session";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const { id } = await context.params;
  const body = await readJson(request);
  if (!isUuid(id) || typeof body?.active !== "boolean")
    return badRequest("Send active (true or false)");
  try {
    await setProductActive(getServices().db, {
      adminId: admin.id,
      productId: id,
      active: body.active,
      note: str(body.note),
    });
    return Response.json({ active: body.active });
  } catch (error) {
    return errorResponse(error, "POST /api/admin/products/:id/status");
  }
}
