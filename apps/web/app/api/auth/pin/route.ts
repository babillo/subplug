// POST /api/auth/pin — set the transaction PIN. Body: { pin, currentPin? (when changing it) }.
import { getServices } from "@/lib/server/services";
import { badRequest, errorResponse, readJson, str } from "@/lib/server/responses";
import { getSignedInUser, unauthorized } from "@/lib/server/session";

export async function POST(request: Request) {
  const user = await getSignedInUser(request);
  if (!user) return unauthorized();
  const body = await readJson(request);
  const pin = str(body?.pin);
  if (!pin) return badRequest("Enter a 4-digit PIN");
  try {
    await getServices()
      .auth()
      .setPin(user.id, { pin, currentPin: str(body?.currentPin) });
    return Response.json({ pinSet: true });
  } catch (error) {
    return errorResponse(error, "POST /api/auth/pin");
  }
}
