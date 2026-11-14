import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AdminNav } from "@/components/admin/admin-nav";
import { getCurrentUser } from "@/lib/server/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  robots: { index: false, follow: false },
};

/**
 * Admins only. Everyone else (signed out, customers, suspended admins) gets "not found", so the
 * panel's existence isn't advertised. The API routes check again on every request.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin" || user.status !== "active") notFound();

  return (
    <div className="lg:flex lg:min-h-dvh">
      <AdminNav adminName={user.fullName.split(" ")[0] ?? user.fullName} />
      <main className="mx-auto grid w-full max-w-6xl min-w-0 content-start gap-6 px-4 py-6 sm:px-6 lg:py-8">
        {children}
      </main>
    </div>
  );
}
