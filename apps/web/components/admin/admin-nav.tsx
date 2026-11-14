"use client";
// Admin navigation: a sidebar on laptops, a scrolling tab row on phones.
import { brand } from "@repo/shared";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/products", label: "Products & prices" },
  { href: "/admin/audit", label: "Audit log" },
];

const isActive = (pathname: string, href: string) =>
  href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

export function AdminNav({ adminName }: { adminName: string }) {
  const pathname = usePathname();
  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r border-line bg-ink p-5 text-on-ink lg:flex">
        <div className="grid gap-1">
          <span className="font-display text-xl font-semibold">{brand.name}</span>
          <span className="text-xs font-bold tracking-wider text-on-ink/60 uppercase">Admin</span>
        </div>
        <nav className="grid gap-1" aria-label="Admin">
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${isActive(pathname, item.href) ? "bg-white/15 text-on-ink" : "text-on-ink/70 hover:bg-white/10 hover:text-on-ink"}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto grid gap-1 text-sm">
          <span className="text-on-ink/60">Signed in as {adminName}</span>
          <Link href="/dashboard" className="font-semibold text-on-ink/90 hover:underline">
            ← My wallet
          </Link>
        </div>
      </aside>

      <div className="sticky top-0 z-20 border-b border-line bg-ink text-on-ink lg:hidden">
        <div className="flex items-center justify-between px-4 pt-3">
          <span className="font-display text-lg font-semibold">
            {brand.name} <span className="text-xs font-bold text-on-ink/60 uppercase">Admin</span>
          </span>
          <Link href="/dashboard" className="text-sm font-semibold text-on-ink/80">
            My wallet
          </Link>
        </div>
        <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-3 py-2">
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${isActive(pathname, item.href) ? "bg-white/15" : "text-on-ink/70"}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
