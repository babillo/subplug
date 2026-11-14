// TEMPORARY test sign-in until real auth (phone/email OTP + transaction PIN) arrives.
// The caller names the user in an `x-test-user-id` header. It only works when
// ALLOW_TEST_AUTH=true AND the app isn't a production build, so it can't leak into a live site.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function testAuthEnabled(): boolean {
  return process.env.ALLOW_TEST_AUTH === "true" && process.env.NODE_ENV !== "production";
}

/** The signed-in user's id, or null. */
export function getTestUserId(request: Request): string | null {
  if (!testAuthEnabled()) return null;
  const id = request.headers.get("x-test-user-id")?.trim() ?? "";
  return UUID.test(id) ? id : null;
}
