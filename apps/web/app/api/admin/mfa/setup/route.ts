// POST /api/admin/mfa/setup — step 1 of two-step sign-in: a new authenticator secret, as a QR code
// (SVG) and as text to type. Not active until confirmed. Refused once two-step is on.
import QRCode from "qrcode";

import { mfaErrorResponse } from "@/lib/server/mfa";
import { errorResponse } from "@/lib/server/responses";
import { getServices } from "@/lib/server/services";
import { requireAdminSignedIn } from "@/lib/server/session";

export async function POST(request: Request) {
  const admin = await requireAdminSignedIn(request);
  if (admin instanceof Response) return admin;
  try {
    const { secret, uri } = await getServices().adminMfa().startSetup(admin.user.id);
    const qrSvg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return Response.json({ secret, uri, qrSvg }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mfaErrorResponse(error) ?? errorResponse(error, "POST /api/admin/mfa/setup");
  }
}
