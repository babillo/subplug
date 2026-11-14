// POST /api/auth/sign-out — ends this session (cookie or Bearer token).
import { getServices } from "@/lib/server/services";
import { clearedSessionCookie, getSessionToken } from "@/lib/server/session";

export async function POST(request: Request) {
  const session = getSessionToken(request);
  if (session) await getServices().auth().signOut(session.token);
  return Response.json({ signedOut: true }, { headers: { "Set-Cookie": clearedSessionCookie() } });
}
