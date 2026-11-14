// POST /api/admin/users/:id/wallet — manual credit/debit (audited).
// Body: { direction: "credit" | "debit", amountKobo, note, idempotencyKey }
// Send the same idempotencyKey on retry: a double-click never moves money twice.
import { adjustWallet } from "@repo/core";

import { getServices } from "@/lib/server/services";
import { badRequest, errorResponse, isUuid, readJson, str } from "@/lib/server/responses";
import { requireAdmin } from "@/lib/server/session";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const { id } = await context.params;
  const body = await readJson(request);
  const direction = body?.direction;
  const amountKobo = body?.amountKobo;
  if (
    !isUuid(id) ||
    (direction !== "credit" && direction !== "debit") ||
    typeof amountKobo !== "number"
  ) {
    return badRequest("Send direction (credit or debit), amountKobo, note and idempotencyKey");
  }
  try {
    const result = await adjustWallet(getServices().db, {
      adminId: admin.id,
      userId: id,
      direction,
      amountKobo,
      note: str(body?.note) ?? "",
      idempotencyKey: str(body?.idempotencyKey) ?? "",
    });
    return Response.json(
      {
        duplicate: result.duplicate,
        entry: {
          id: result.entry.id,
          direction: result.entry.direction,
          amountKobo: result.entry.amountKobo,
          balanceAfterKobo: result.entry.balanceAfterKobo,
        },
      },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error) {
    return errorResponse(error, "POST /api/admin/users/:id/wallet");
  }
}
