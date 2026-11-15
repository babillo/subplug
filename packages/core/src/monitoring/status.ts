// The admin System page's numbers: are the background jobs running, can VTpass cover what
// customers hold, does the ledger add up, and what has gone wrong lately.
import { type Database, schema } from "@repo/db";
import { and, count, desc, eq, gte } from "drizzle-orm";

import { getAdminOverview } from "../admin/admin.ts";
import type { GetProvider } from "../orders/purchase.ts";
import { listRecentErrors } from "./errors.ts";
import { JOBS, type JobName } from "./jobs.ts";

const { errorLog, jobRuns } = schema;

export interface JobStatus {
  job: JobName;
  label: string;
  everyMinutes: number;
  lastRunAt: Date | null;
  lastOk: boolean | null;
  lastError: string | null;
  lastOkAt: Date | null;
  /** Never ran, last run failed, or no success for 3 intervals. Needs a look. */
  stale: boolean;
}

export async function getSystemStatus(
  db: Database,
  options: { getProvider: GetProvider; providerId?: string; now?: Date },
) {
  const now = options.now ?? new Date();

  const jobs: JobStatus[] = [];
  for (const j of JOBS) {
    const [last] = await db
      .select()
      .from(jobRuns)
      .where(eq(jobRuns.job, j.name))
      .orderBy(desc(jobRuns.startedAt))
      .limit(1);
    const [lastOk] = await db
      .select({ at: jobRuns.startedAt })
      .from(jobRuns)
      .where(and(eq(jobRuns.job, j.name), eq(jobRuns.ok, true)))
      .orderBy(desc(jobRuns.startedAt))
      .limit(1);
    const tooOld = !lastOk || now.getTime() - lastOk.at.getTime() > 3 * j.everyMinutes * 60 * 1000;
    jobs.push({
      job: j.name,
      label: j.label,
      everyMinutes: j.everyMinutes,
      lastRunAt: last?.startedAt ?? null,
      lastOk: last ? last.ok : null,
      lastError: last?.error ?? null,
      lastOkAt: lastOk?.at ?? null,
      stale: !last || !last.ok || tooOld,
    });
  }

  const providerId = options.providerId ?? "vtpass";
  let provider: { id: string; balanceKobo: number | null; error: string | null };
  try {
    const { balanceKobo } = await options.getProvider(providerId).getBalance();
    provider = { id: providerId, balanceKobo, error: null };
  } catch (error) {
    provider = {
      id: providerId,
      balanceKobo: null,
      error: (error instanceof Error ? error.message : String(error)).slice(0, 300),
    };
  }

  const overview = await getAdminOverview(db, now);
  const [errorsRow] = await db
    .select({ n: count() })
    .from(errorLog)
    .where(gte(errorLog.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)));

  return {
    jobs,
    provider,
    walletsTotalKobo: overview.walletsTotalKobo,
    ledgerMatches: overview.ledgerMatches,
    stuckCount: overview.stuckCount,
    /** Can VTpass cover everything customers could spend right now? null if unknown. */
    providerCoversWallets:
      provider.balanceKobo === null ? null : provider.balanceKobo >= overview.walletsTotalKobo,
    errorsLast24h: errorsRow?.n ?? 0,
    recentErrors: await listRecentErrors(db, 20),
  };
}

export type SystemStatus = Awaited<ReturnType<typeof getSystemStatus>>;
