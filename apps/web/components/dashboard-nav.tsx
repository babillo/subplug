"use client";
// Phones: a bottom tab bar. Wider screens: a sidebar. Same four tasks either way.
import { brand } from "@repo/shared";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "Home", icon: "⌂" },
  { href: "/dashboard/data", label: "Buy", icon: "⇅" },
  { href: "/dashboard/fund", label: "Fund", icon: "+" },
  { href: "/dashboard/history", label: "History", icon: "≡" },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/dashboard/data")
    return pathname.startsWith("/dashboard/data") || pathname.startsWith("/dashboard/airtime");
  return pathname.startsWith(href);
}

export function DashboardNav({ firstName }: { firstName: string }) {
  const pathname = usePathname();
  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r border-line bg-card p-5 md:flex">
        <Link href="/dashboard" className="font-display text-xl font-semibold">
          {brand.name}
        </Link>
        <nav className="grid gap-1" aria-label="Main">
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 font-semibold ${isActive(pathname, item.href) ? "bg-cobalt-soft text-cobalt" : "text-muted hover:bg-paper hover:text-fg"}`}
            >
              <span aria-hidden className="w-5 text-center font-display">
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/dashboard/settings"
          className={`mt-auto rounded-xl px-3 py-2.5 text-sm font-semibold ${pathname.startsWith("/dashboard/settings") ? "bg-cobalt-soft text-cobalt" : "text-muted hover:bg-paper"}`}
        >
          {firstName} · Settings
        </Link>
      </aside>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-card md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
            className={`grid justify-items-center gap-0.5 py-2.5 text-[11px] font-bold ${isActive(pathname, item.href) ? "text-cobalt" : "text-muted"}`}
          >
            <span aria-hidden className="font-display text-lg leading-none">
              {item.icon}
            </span>
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
