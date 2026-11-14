import type { Metadata } from "next";
import Link from "next/link";

import { Card, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/server/current-user";

import { ChangePin, ResetPin, SignOut } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <>
      <PageTitle title="Settings" />
      <Card className="grid gap-1 text-sm">
        <div className="font-display text-lg font-semibold">{user.fullName}</div>
        {user.phone && <div className="text-muted">{user.phone}</div>}
        {user.email && <div className="text-muted">{user.email}</div>}
      </Card>
      {user.pinLockedAt ? (
        <Card className="grid gap-3">
          <h2 className="font-display text-lg font-semibold">Your PIN is locked</h2>
          <p className="text-sm text-muted">
            After 5 wrong tries we lock purchases to protect your money. Reset your PIN with a code
            to unlock.
          </p>
          <ResetPin />
        </Card>
      ) : (
        <>
          <Card className="grid gap-3">
            <h2 className="font-display text-lg font-semibold">Change PIN</h2>
            <ChangePin />
          </Card>
          <Card className="grid gap-3">
            <h2 className="font-display text-lg font-semibold">Forgot your PIN?</h2>
            <ResetPin />
          </Card>
        </>
      )}
      {user.role === "admin" && user.status === "active" && (
        <Link
          href="/admin"
          className="rounded-2xl border border-line bg-card p-4 font-semibold text-cobalt hover:border-cobalt"
        >
          Open the admin panel →
        </Link>
      )}
      <SignOut />
    </>
  );
}
