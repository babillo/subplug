// The signed-in customer for server components (pages and layouts).
import type { User } from "@repo/core";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getServices } from "./services";
import { SESSION_COOKIE } from "./session";

export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getServices().auth().getSessionUser(token);
}

/** The signed-in user and session id from the cookie (admin pages need the session). */
export async function getCurrentSession(): Promise<{ user: User; sessionId: string } | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getServices().auth().getSession(token);
}

/** The signed-in customer, or a redirect to sign in. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}
