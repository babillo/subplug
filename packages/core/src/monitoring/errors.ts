// Server errors that reached a customer as "Something went wrong" are saved here, so the admin
// System page shows them (the terminal is gone once we're hosted). Saving must never itself
// break a request, so failures to save are only printed.
import { type DbOrTx, schema } from "@repo/db";
import { desc } from "drizzle-orm";

const { errorLog } = schema;

export async function recordError(db: DbOrTx, context: string, error: unknown): Promise<void> {
  try {
    const message = error instanceof Error ? error.message : String(error);
    const detail = error instanceof Error ? (error.stack ?? null) : null;
    await db.insert(errorLog).values({
      context: context.slice(0, 200),
      message: message.slice(0, 500) || "(no message)",
      detail: detail?.slice(0, 4000) ?? null,
    });
  } catch (saveError) {
    console.error("Couldn't save error to error_log", saveError);
  }
}

export async function listRecentErrors(db: DbOrTx, limit = 20) {
  return db
    .select()
    .from(errorLog)
    .orderBy(desc(errorLog.createdAt), desc(errorLog.id))
    .limit(limit);
}
