import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** One row per background job run (`pnpm jobs:run`, later a Cloudflare schedule). */
export const jobRuns = pgTable(
  "job_runs",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** e.g. "orders.recheck", "funding.reconcile", "cleanup". */
    job: text().notNull(),
    startedAt: timestamp({ withTimezone: true }).notNull(),
    finishedAt: timestamp({ withTimezone: true }).notNull(),
    ok: boolean().notNull(),
    /** What it did, e.g. { checked: 3, credited: 1 }. */
    summary: jsonb(),
    /** Why it failed (plain message, never keys). */
    error: text(),
  },
  (t) => [index("job_runs_job_started_idx").on(t.job, t.startedAt)],
);

/** Server errors that reached customers as "Something went wrong", kept for the System page. */
export const errorLog = pgTable(
  "error_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Where it happened, e.g. "POST /api/orders". */
    context: text().notNull(),
    message: text().notNull(),
    /** Stack trace, shortened. */
    detail: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("error_log_created_idx").on(t.createdAt)],
);
