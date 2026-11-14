// GET /api/auth/me — the signed-in customer (or 401).
import { getSignedInUser, unauthorized, userView } from "@/lib/server/session";

export async function GET(request: Request) {
  const user = await getSignedInUser(request);
  return user ? Response.json({ user: userView(user) }) : unauthorized();
}
