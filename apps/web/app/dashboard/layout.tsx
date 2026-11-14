import { brand } from "@repo/shared";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardNav } from "@/components/dashboard-nav";
import { requireUser } from "@/lib/server/current-user";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user.pinHash) redirect("/set-pin");
  const firstName = user.fullName.split(" ")[0] ?? user.fullName;

  return (
    <div className="flex min-h-dvh">
      <DashboardNav firstName={firstName} />
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-line bg-card px-4 py-3 md:hidden">
          <span className="font-display text-lg font-semibold">{brand.name}</span>
          <Link
            href="/dashboard/settings"
            className="rounded-full bg-cobalt-soft px-3 py-1 text-sm font-semibold text-cobalt"
          >
            {firstName}
          </Link>
        </header>
        <main className="mx-auto grid max-w-3xl gap-6 px-4 pt-6 pb-28 sm:px-6 md:pb-10">
          {children}
        </main>
      </div>
    </div>
  );
}
