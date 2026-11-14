// POST /api/auth/pin/reset-code — send a PIN-reset code to the signed-in customer's phone.
import { getServices } from "@/lib/server/services";
import { errorResponse } from "@/lib/server/responses";
import { getSignedInUser, unauthorized } from "@/lib/server/session";

export async function POST(request: Request) {
  const user = await getSignedInUser(request);
  if (!user) return unauthorized();
  try {
    const result = await getServices().auth().requestPinResetOtp(user.id);
    return Response.json({ sent: true, ...result });
  } catch (error) {
    return errorResponse(error, "POST /api/auth/pin/reset-code");
  }
}
