// POST /api/auth/pin/reset — Body: { code, pin }. Sets a new PIN and unlocks it.
import { getServices } from "@/lib/server/services";
import { badRequest, errorResponse, readJson, str } from "@/lib/server/responses";
import { getSignedInUser, unauthorized } from "@/lib/server/session";

export async function POST(request: Request) {
  const user = await getSignedInUser(request);
  if (!user) return unauthorized();
  const body = await readJson(request);
  const code = str(body?.code);
  const pin = str(body?.pin);
  if (!code || !pin) return badRequest("Enter the code we sent you and a new 4-digit PIN");
  try {
    await getServices().auth().resetPin(user.id, { code, pin });
    return Response.json({ pinSet: true });
  } catch (error) {
    return errorResponse(error, "POST /api/auth/pin/reset");
  }
}
