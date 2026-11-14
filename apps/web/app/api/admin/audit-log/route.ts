// GET /api/admin/audit-log?entityType=&entityId=&limit=&offset= — every admin change, newest first.
import { listAuditLog } from "@repo/core";

import { getServices } from "@/lib/server/services";
import { pageFrom } from "@/lib/server/responses";
import { requireAdmin } from "@/lib/server/session";

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const url = new URL(request.url);
  const result = await listAuditLog(getServices().db, {
    ...pageFrom(url),
    entityType: url.searchParams.get("entityType") ?? undefined,
    entityId: url.searchParams.get("entityId") ?? undefined,
  });
  return Response.json(result);
}
