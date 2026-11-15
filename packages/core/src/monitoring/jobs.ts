// Background jobs, all in one place. `pnpm jobs:run` runs them on the laptop; once hosted, a
// Cloudflare schedule runs them every few minutes. Each run is recorded in job_runs (shown on the
// admin System page), and one job failing never stops the others.
import { type Database, schema } from "@repo/db";
import { lt } from "drizzle-orm";

import { reconcileFunding } from "../funding/funding.ts";
import type { FundingGateway } from "../funding/types.ts";
import { recheckPendingOrders } from "../orders/recheck.ts";
import type { GetProvider } from "../orders/purchase.ts";
import { cleanupRateLimits } from "../rate-limit/rate-limit.ts";

const { errorLog, jobRuns, otpCodes, sessions } = schema;

export type JobName = "orders.recheck" | "funding.reconcile" | "cleanup";

/** The jobs and how often they should run. A job is "stale" after 3 missed intervals. */
export const JOBS: { name: JobName; label: string; everyMinutes: number }[] = [
  { name: "orders.recheck", label: "Re-check pending orders with VTpass", everyMinutes: 5 },
  { name: "funding.reconcile", label: "Check Monnify for missed payments", everyMinutes: 15 },
  { name: "cleanup", label: "Clean up old records", everyMinutes: 24 * 60 },
];

export interface JobResult {
  job: JobName;
  ok: boolean;
  summary: Record<string, unknown> | null;
  error: string | null;
  ms: number;
}

const DAY = 24 * 60 * 60 * 1000;

export async function runJobs(deps: {
  db: Database;
  getProvider: GetProvider;
  /** Created only when needed, so a missing Monnify setting fails just that job. */
  getFundingGateway: () => FundingGateway;
  only?: JobName[];
  now?: () => Date;
}): Promise<JobResult[]> {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());

  const work: Record<JobName, () => Promise<Record<string, unknown>>> = {
    "orders.recheck": async () => {
      const s = await recheckPendingOrders({ db, getProvider: deps.getProvider });
      return {
        checked: s.checked,
        succeeded: s.succeeded,
        failed: s.failed,
        stillPending: s.stillPending,
        errors: s.errors,
        stuckOver24h: s.stale.length,
      };
    },
    "funding.reconcile": async () => {
      const s = await reconcileFunding(db, deps.getFundingGateway());
      return { ...s };
    },
    cleanup: async () => {
      const at = now();
      const ago = (days: number) => new Date(at.getTime() - days * DAY);
      const count = (rows: unknown[]) => rows.length;
      return {
        expiredSessions: count(
          await db
            .delete(sessions)
            .where(lt(sessions.expiresAt, at))
            .returning({ id: sessions.id }),
        ),
        // Sign-in codes: kept 2 days (the hourly limits look back one hour).
        oldCodes: count(
          await db
            .delete(otpCodes)
            .where(lt(otpCodes.createdAt, ago(2)))
            .returning({ id: otpCodes.id }),
        ),
        oldRateLimits: await cleanupRateLimits(db, at),
        oldErrors: count(
          await db
            .delete(errorLog)
            .where(lt(errorLog.createdAt, ago(30)))
            .returning({ id: errorLog.id }),
        ),
        oldJobRuns: count(
          await db
            .delete(jobRuns)
            .where(lt(jobRuns.startedAt, ago(30)))
            .returning({ id: jobRuns.id }),
        ),
      };
    },
  };

  const results: JobResult[] = [];
  for (const { name } of JOBS) {
    if (deps.only && !deps.only.includes(name)) continue;
    const startedAt = now();
    const t0 = Date.now();
    let result: JobResult;
    try {
      result = {
        job: name,
        ok: true,
        summary: await work[name](),
        error: null,
        ms: Date.now() - t0,
      };
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
      result = { job: name, ok: false, summary: null, error: message, ms: Date.now() - t0 };
    }
    await db.insert(jobRuns).values({
      job: name,
      startedAt,
      finishedAt: new Date(startedAt.getTime() + result.ms),
      ok: result.ok,
      summary: result.summary,
      error: result.error,
    });
    results.push(result);
  }
  return results;
}

/**
 * Which jobs are due when the 5-minute schedule fires (Cloudflare Cron "*\/5 * * * *"):
 * re-check every time, Monnify on the quarter hour, clean-up daily at 03:00 Lagos (02:00 UTC).
 */
export function jobsDueAt(time: Date): JobName[] {
  const minute = time.getUTCMinutes();
  const due: JobName[] = ["orders.recheck"];
  if (minute % 15 === 0) due.push("funding.reconcile");
  if (time.getUTCHours() === 2 && minute === 0) due.push("cleanup");
  return due;
}
