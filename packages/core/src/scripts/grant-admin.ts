// pnpm admin:grant <email or phone> [--revoke] — makes an existing account an admin (or removes
// it). The person must have signed up first. Audited. Laptop only: there is no web route for this.
import { createDb, loadLocalEnv, schema } from "@repo/db";
import { normaliseNigerianPhone } from "@repo/shared/orders";
import { eq } from "drizzle-orm";

import { setAdminRole } from "../admin/admin.ts";

loadLocalEnv();

const who = process.argv[2]?.trim() ?? "";
const revoke = process.argv.includes("--revoke");
if (!who) {
  console.error("Usage: pnpm admin:grant <email or phone> [--revoke]");
  process.exit(1);
}

const { db, close } = createDb();
try {
  const phone = normaliseNigerianPhone(who);
  const [user] = await db
    .select()
    .from(schema.users)
    .where(phone ? eq(schema.users.phone, phone) : eq(schema.users.email, who.toLowerCase()));
  if (!user) throw new Error(`No account for ${who}. Sign up first, then run this again.`);
  await setAdminRole(db, {
    userId: user.id,
    admin: !revoke,
    note: `${revoke ? "Revoked" : "Granted"} with pnpm admin:grant`,
  });
  console.log(
    `${user.fullName} (${user.email ?? user.phone}) is now ${revoke ? "a customer" : "an admin"}.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await close();
}
