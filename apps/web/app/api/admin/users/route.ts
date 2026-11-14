// GET /api/admin/users?search=&limit=&offset= — customers with balances.
import { listUsers } from "@repo/core";

import { getServices } from "@/lib/server/services";
import { pageFrom } from "@/lib/server/responses";
import { requireAdmin } from "@/lib/server/session";

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const url = new URL(request.url);
  const result = await listUsers(getServices().db, {
    ...pageFrom(url),
    search: url.searchParams.get("search") ?? undefined,
  });
  return Response.json(result);
}
