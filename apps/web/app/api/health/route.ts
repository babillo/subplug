// GET /api/health — for an uptime checker (e.g. a free service that pings us every few minutes
// and emails if we're down). Answers 200 when the app and database work, 503 otherwise. Shows no
// details, so it's safe to leave public.
import { pingDatabase } from "@repo/core";

import { getServices } from "@/lib/server/services";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    await pingDatabase(getServices().db);
    return Response.json(
      { ok: true, db: "ok", ms: Date.now() - started },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { ok: false, db: "unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
