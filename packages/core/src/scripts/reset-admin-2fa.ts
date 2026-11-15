// pnpm admin:reset-2fa <email or phone> ["reason"]
// Turns off an admin's two-step sign-in (e.g. lost phone), so they can set it up again at /admin.
// Laptop only (needs DATABASE_URL): there is deliberately no web route for this. Audited.
import { createDb, loadLocalEnv, schema } from "@repo/db";
import { normaliseNigerianPhone } from "@repo/shared/orders";
import { eq } from "drizzle-orm";

import { createAdminMfa } from "../auth/admin-mfa.ts";
import { getAuthSecret } from "../auth/senders.ts";

loadLocalEnv();

const who = process.argv[2]?.trim() ?? "";
const reason = process.argv[3]?.trim() || "Reset from the laptop (pnpm admin:reset-2fa)";
if (!who) {
  console.error('Usage: pnpm admin:reset-2fa <email or phone> ["reason"]');
  process.exit(1);
}

const { db, close } = createDb();
try {
  const phone = normaliseNigerianPhone(who);
  const [user] = await db
    .select()
    .from(schema.users)
    .where(phone ? eq(schema.users.phone, phone) : eq(schema.users.email, who.toLowerCase()));
  if (!user) throw new Error(`No user with email or phone "${who}"`);
  if (user.role !== "admin") throw new Error(`${user.fullName} is not an admin`);
  await createAdminMfa({ db, secret: getAuthSecret() }).reset(user.id, reason);
  console.log(
    `Two-step sign-in reset for ${user.fullName}. They'll set it up again next time they open /admin.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await close();
}
