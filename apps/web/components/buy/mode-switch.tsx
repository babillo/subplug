import Link from "next/link";

export function ModeSwitch({ current }: { current: "data" | "airtime" }) {
  const item = (mode: "data" | "airtime", label: string) => (
    <Link
      href={`/dashboard/${mode}`}
      aria-current={current === mode ? "page" : undefined}
      className={`rounded-full px-3 py-1 ${current === mode ? "bg-ink text-on-ink" : "text-muted"}`}
    >
      {label}
    </Link>
  );
  return (
    <nav
      aria-label="Data or airtime"
      className="flex gap-1 rounded-full border border-line bg-card p-1 text-sm font-semibold"
    >
      {item("data", "Data")}
      {item("airtime", "Airtime")}
    </nav>
  );
}
