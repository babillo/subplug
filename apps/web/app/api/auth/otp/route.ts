// POST /api/auth/otp — send a sign-in code. Body: { destination: phone number or email }.
// Always answers the same way whether or not an account exists (no account guessing).
import { getServices } from "@/lib/server/services";
import { badRequest, errorResponse, readJson, str } from "@/lib/server/responses";

export async function POST(request: Request) {
  const body = await readJson(request);
  const destination = str(body?.destination);
  if (!destination) return badRequest("Enter your phone number or email");
  try {
    const result = await getServices().auth().requestOtp({ destination, purpose: "sign_in" });
    return Response.json({ sent: true, ...result });
  } catch (error) {
    return errorResponse(error, "POST /api/auth/otp");
  }
}
