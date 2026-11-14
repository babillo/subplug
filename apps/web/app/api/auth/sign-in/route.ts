// POST /api/auth/sign-in — Body: { destination, code, fullName?, email?, phone? }.
// New customers get { status: "profile_required" } until they also send their name (and email when
// signing up by phone). On success the web gets a secure session cookie; the mobile app (header
// "x-client: mobile") also gets the token in the body to keep in secure storage.
import { getServices } from "@/lib/server/services";
import { badRequest, errorResponse, readJson, str } from "@/lib/server/responses";
import { sessionCookie, userView } from "@/lib/server/session";

export async function POST(request: Request) {
  const body = await readJson(request);
  const destination = str(body?.destination);
  const code = str(body?.code);
  if (!destination || !code) return badRequest("Enter the code we sent you");

  try {
    const result = await getServices()
      .auth()
      .signIn({
        destination,
        code,
        fullName: str(body?.fullName),
        email: str(body?.email),
        phone: str(body?.phone),
      });
    if (result.status === "profile_required") return Response.json(result);

    const isMobile = request.headers.get("x-client") === "mobile";
    return Response.json(
      {
        status: "signed_in",
        user: userView(result.user),
        expiresAt: result.expiresAt.toISOString(),
        ...(isMobile ? { token: result.token } : {}),
      },
      { headers: { "Set-Cookie": sessionCookie(result.token, result.expiresAt) } },
    );
  } catch (error) {
    return errorResponse(error, "POST /api/auth/sign-in");
  }
}
