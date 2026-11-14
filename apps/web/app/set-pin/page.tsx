import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/server/current-user";

import { SetPinFlow } from "./set-pin-flow";

export const metadata: Metadata = { title: "Set your PIN" };
export const dynamic = "force-dynamic";

export default async function SetPinPage() {
  const user = await requireUser();
  if (user.pinHash) redirect("/dashboard");
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-8 px-4 py-12">
      <div className="grid gap-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Set your transaction PIN
        </h1>
        <p className="text-muted">
          You’ll enter it to confirm every purchase. Avoid easy ones like 1234 or 0000.
        </p>
      </div>
      <SetPinFlow />
    </main>
  );
}
