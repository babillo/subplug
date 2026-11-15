// Admin pages: who may see them, and whether two-step sign-in has been passed.
import type { User } from "@repo/core";
import { notFound } from "next/navigation";

import { getCurrentSession } from "./current-user";
import { getServices } from "./services";

export type AdminAccess =
  { state: "ok"; user: User } | { state: "needs_mfa"; user: User; enrolled: boolean };

/**
 * Non-admins get "not found". Admins either may continue, or must first set up / pass two-step
 * sign-in on this session. Every admin page (and the layout) checks this on each request, so an
 * approval that expires mid-session can't be skipped by moving between pages.
 */
export async function getAdminAccess(): Promise<AdminAccess> {
  const signedIn = await getCurrentSession();
  if (!signedIn || signedIn.user.role !== "admin" || signedIn.user.status !== "active") notFound();
  const mfa = await getServices().adminMfa().status(signedIn.user.id, signedIn.sessionId);
  return mfa.verified
    ? { state: "ok", user: signedIn.user }
    : { state: "needs_mfa", user: signedIn.user, enrolled: mfa.enrolled };
}
