// POST /api/admin/system/monnify-check — signs in to Monnify once with the site's keys and says
// whether it worked, plus which Cloudflare data centre ran the check. Admin only; no money moves.
import { cloudflareColo, getServices } from "@/lib/server/services";
import { requireAdmin } from "@/lib/server/session";

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const started = Date.now();
  const colo = cloudflareColo();
  try {
    await getServices().fundingGateway().checkConnection();
    return Response.json({ ok: true, colo, ms: Date.now() - started });
  } catch (error) {
    return Response.json({
      ok: false,
      colo,
      ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
