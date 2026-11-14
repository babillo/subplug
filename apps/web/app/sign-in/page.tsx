import { brand } from "@repo/shared";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/server/current-user";

import { SignInFlow } from "./sign-in-flow";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const user = await getCurrentUser().catch(() => null);
  if (user) redirect(user.pinHash ? "/dashboard" : "/set-pin");
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-8 px-4 py-12">
      <div className="grid gap-2">
        <span className="font-display text-lg font-semibold">{brand.name}</span>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Sign in or create an account
        </h1>
        <p className="text-muted">We’ll send you a 6-digit code. No password needed.</p>
      </div>
      <SignInFlow />
    </main>
  );
}
