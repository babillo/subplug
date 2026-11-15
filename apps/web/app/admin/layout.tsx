import type { Metadata } from "next";

import { AdminNav } from "@/components/admin/admin-nav";
import { MfaGate } from "@/components/admin/mfa-gate";
import { getAdminAccess } from "@/lib/server/admin-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  robots: { index: false, follow: false },
};

/**
 * Admins only. Everyone else (signed out, customers, suspended admins) gets "not found", so the
 * panel's existence isn't advertised. Admins must also pass two-step sign-in (12 hours per
 * device). The API routes check both again on every request.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await getAdminAccess();
  const user = access.user;
  if (access.state === "needs_mfa") {
    return (
      <main className="min-h-dvh px-4 sm:px-6">
        <MfaGate
          enrolled={access.enrolled}
          firstName={user.fullName.split(" ")[0] ?? user.fullName}
        />
      </main>
    );
  }

  return (
    <div className="lg:flex lg:min-h-dvh">
      <AdminNav adminName={user.fullName.split(" ")[0] ?? user.fullName} />
      <main className="mx-auto grid w-full max-w-6xl min-w-0 content-start gap-6 px-4 py-6 sm:px-6 lg:py-8">
        {children}
      </main>
    </div>
  );
}
