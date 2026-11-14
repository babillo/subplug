// GET /api/admin/products — every product, with the provider's cost and each tier's price.
import { listProductsAdmin } from "@repo/core";

import { getServices } from "@/lib/server/services";
import { requireAdmin } from "@/lib/server/session";

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  return Response.json({ products: await listProductsAdmin(getServices().db) });
}
