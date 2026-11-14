// GET /api/admin/users/:id — one customer: balance, PIN state, funding accounts, order count.
import { getUserDetail } from "@repo/core";

import { getServices } from "@/lib/server/services";
import { requireAdmin } from "@/lib/server/session";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const { id } = await context.params;
  const user = await getUserDetail(getServices().db, id);
  return user
    ? Response.json({ user })
    : Response.json(
        { error: { code: "not_found", message: "Customer not found." } },
        { status: 404 },
      );
}
