import { brand } from "@repo/shared";
import Link from "next/link";

import { getCurrentUser } from "@/lib/server/current-user";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser().catch(() => null);
  return (
    <main className="mx-auto grid min-h-dvh max-w-5xl content-center gap-10 px-4 py-16 sm:px-6">
      <div className="grid max-w-xl gap-5">
        <span className="text-xs font-bold tracking-[.12em] text-muted uppercase">
          Data · Airtime · Instant
        </span>
        <h1 className="font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {brand.name}
        </h1>
        <p className="text-lg text-muted">
          {brand.tagline} Fund your wallet by bank transfer, then top up any MTN, Airtel, Glo or
          9mobile number in seconds.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href={user ? "/dashboard" : "/sign-in"}
            className="rounded-xl bg-cobalt px-5 py-3 font-bold text-white hover:bg-cobalt-strong"
          >
            {user ? "Go to your wallet" : "Get started"}
          </Link>
          {!user && (
            <Link
              href="/sign-in"
              className="rounded-xl px-5 py-3 font-bold text-cobalt hover:bg-cobalt-soft"
            >
              I have an account
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
