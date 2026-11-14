// POST /api/admin/users/:id/status — suspend or reactivate a customer (audited).
// Body: { status: "active" | "suspended", note }
import { setUserStatus } from "@repo/core";

import { getServices } from "@/lib/server/services";
import { badRequest, errorResponse, isUuid, readJson, str } from "@/lib/server/responses";
import { requireAdmin } from "@/lib/server/session";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const { id } = await context.params;
  const body = await readJson(request);
  const status = body?.status;
  if (!isUuid(id) || (status !== "active" && status !== "suspended")) {
    return badRequest("Send status (active or suspended) and a note");
  }
  try {
    await setUserStatus(getServices().db, {
      adminId: admin.id,
      userId: id,
      status,
      note: str(body?.note) ?? "",
    });
    return Response.json({ status });
  } catch (error) {
    return errorResponse(error, "POST /api/admin/users/:id/status");
  }
}
