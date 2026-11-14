// Small building blocks shared by every screen. Colours come only from the design tokens.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const styles = {
    primary: "bg-cobalt text-white hover:bg-cobalt-strong disabled:opacity-50",
    secondary: "bg-card text-fg border border-line hover:bg-paper disabled:opacity-50",
    ghost: "text-cobalt hover:bg-cobalt-soft disabled:opacity-50",
    danger: "bg-bad-soft text-bad hover:opacity-90 disabled:opacity-50",
  }[variant];
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[15px] font-bold transition-colors ${styles} ${className}`}
      {...props}
    />
  );
}

export function TextField({
  label,
  hint,
  error,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  error?: string;
  id: string;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`w-full rounded-xl border-[1.5px] bg-card px-3.5 py-3 text-[16px] outline-none focus:border-cobalt ${error ? "border-bad" : "border-line"}`}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-bad">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-line bg-card p-4 sm:p-5 ${className}`}>
      {children}
    </div>
  );
}

export function Notice({
  tone = "warn",
  children,
}: {
  tone?: "warn" | "bad" | "ok";
  children: ReactNode;
}) {
  const styles = {
    warn: "bg-warn-soft text-warn",
    bad: "bg-bad-soft text-bad",
    ok: "bg-ok-soft text-ok",
  }[tone];
  return (
    <div
      role={tone === "bad" ? "alert" : "status"}
      className={`rounded-xl px-3.5 py-3 text-sm font-semibold ${styles}`}
    >
      {children}
    </div>
  );
}

export function StatusPill({
  status,
}: {
  status: "pending" | "success" | "failed";
  refunded?: boolean;
}) {
  const map = {
    success: ["Delivered", "bg-ok-soft text-ok"],
    pending: ["Processing", "bg-warn-soft text-warn"],
    failed: ["Refunded", "bg-bad-soft text-bad"],
  } as const;
  const [label, style] = map[status];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${style}`}>{label}</span>;
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="grid gap-1">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
        {title}
      </h1>
      {subtitle ? <p className="text-muted">{subtitle}</p> : null}
    </div>
  );
}
