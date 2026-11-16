// POST /api/admin/system/monnify-check — signs in to Monnify once with the site's keys and says
// whether it worked, plus which Cloudflare data centre ran the check and a harmless fingerprint of
// the keys (to compare with `pnpm monnify:fingerprint` on the laptop). Admin only; no money moves.
import { formatFingerprint, monnifyFingerprint } from "@repo/core";

import { cloudflareColo, getServices } from "@/lib/server/services";
import { requireAdmin } from "@/lib/server/session";

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;
  const started = Date.now();
  const colo = cloudflareColo();
  const fingerprint = formatFingerprint(monnifyFingerprint(process.env));
  try {
    await getServices().fundingGateway().checkConnection();
    return Response.json({ ok: true, colo, ms: Date.now() - started, fingerprint });
  } catch (error) {
    return Response.json({
      ok: false,
      colo,
      ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
      fingerprint,
    });
  }
}
