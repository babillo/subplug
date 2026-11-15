// POST /api/admin/mfa/verify — Body: { code } (6 digits from the app, or a backup code).
// Approves this session for admin work for 12 hours. 5 tries per 10 minutes.
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
  if (!code) return badRequest("Enter the code from your authenticator app, or a backup code");
  try {
    const result = await getServices().adminMfa().verify(admin.user.id, admin.sessionId, code);
    return Response.json(result);
  } catch (error) {
    return mfaErrorResponse(error) ?? errorResponse(error, "POST /api/admin/mfa/verify");
  }
}
