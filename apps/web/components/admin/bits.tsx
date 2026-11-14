// Small display pieces for admin screens.
import Link from "next/link";
import type { ReactNode } from "react";

export function OrderStatusBadge({
  status,
  refunded,
}: {
  status: "pending" | "success" | "failed";
  refunded?: boolean;
}) {
  const [label, style] = {
    success: ["Success", "bg-ok-soft text-ok"],
    pending: ["Pending", "bg-warn-soft text-warn"],
    failed: [refunded ? "Failed · refunded" : "Failed", "bg-bad-soft text-bad"],
  }[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap ${style}`}>
      {label}
    </span>
  );
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "ok" | "warn" | "bad" | "cobalt";
  children: ReactNode;
}) {
  const style = {
    neutral: "bg-paper text-muted border border-line",
    ok: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn",
    bad: "bg-bad-soft text-bad",
    cobalt: "bg-cobalt-soft text-cobalt",
  }[tone];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap ${style}`}>
      {children}
    </span>
  );
}

/** Pill-style filter links (status filters, tabs). */
export function FilterTabs({
  label,
  items,
  current,
}: {
  label: string;
  items: { id: string; label: string; href: string }[];
  current: string;
}) {
  return (
    <nav
      aria-label={label}
      className="flex max-w-full gap-1 justify-self-start overflow-x-auto rounded-full border border-line bg-card p-1 text-sm font-semibold"
    >
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          aria-current={current === item.id ? "page" : undefined}
          className={`shrink-0 rounded-full px-3 py-1 ${current === item.id ? "bg-ink text-on-ink" : "text-muted hover:text-fg"}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function Stat({
  label,
  value,
  detail,
  tone,
  href,
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  tone?: "warn" | "bad" | "ok";
  href?: string;
}) {
  const body = (
    <>
      <div className="text-sm font-semibold text-muted">{label}</div>
      <div
        className={`num font-display text-2xl font-semibold tracking-tight ${tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : ""}`}
      >
        {value}
      </div>
      {detail && <div className="text-sm text-muted">{detail}</div>}
    </>
  );
  const className = "grid content-start gap-1 rounded-2xl border border-line bg-card p-4";
  return href ? (
    <Link href={href} className={`${className} hover:border-cobalt`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function ShowMore({ href }: { href: string }) {
  return (
    <Link href={href} className="mt-3 block text-center text-sm font-semibold text-cobalt">
      Show more
    </Link>
  );
}
