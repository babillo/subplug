// POST /api/admin/mfa/confirm — Body: { code }. Step 2: a correct code switches two-step on and
// returns the 10 backup codes (shown once, never again).
import { RATE_LIMITS } from "@repo/core";

import { mfaErrorResponse } from "@/lib/server/mfa";
import { rateLimited } from "@/lib/server/rate-limit";
import { badRequest, errorResponse, readJson, str } from "@/lib/server/responses";
import { getServices } from "@/lib/server/services";
import { requireAdminSignedIn } from "@/lib/server/session";

export async function POST(request: Request) {
  const admin = await requireAdminSignedIn(request);
  if (admin instanceof Response) return admin;
  const limited = await rateLimited(`admin-mfa:user:${admin.user.id}`, RATE_LIMITS.adminMfaPerUser);
  if (limited) return limited;
  const code = str((await readJson(request))?.code);
  if (!code) return badRequest("Enter the 6-digit code from your authenticator app");
  try {
    const { recoveryCodes } = await getServices()
      .adminMfa()
      .confirmSetup(admin.user.id, admin.sessionId, code);
    return Response.json({ recoveryCodes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mfaErrorResponse(error) ?? errorResponse(error, "POST /api/admin/mfa/confirm");
  }
}
