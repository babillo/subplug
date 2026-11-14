// What the customer sees after a purchase: done, processing, or failed-and-refunded.
import Link from "next/link";

import { Button } from "./ui";

export function ResultView({
  status,
  title,
  message,
  onAgain,
}: {
  status: "success" | "pending" | "failed";
  title: string;
  message: string;
  onAgain: () => void;
}) {
  const badge = {
    success: ["✓", "bg-ok-soft text-ok"],
    pending: ["…", "bg-warn-soft text-warn"],
    failed: ["!", "bg-bad-soft text-bad"],
  } as const;
  const [mark, style] = badge[status];
  return (
    <div className="grid justify-items-center gap-3 py-4 text-center" role="status">
      <div
        className={`grid size-16 place-items-center rounded-full font-display text-3xl font-bold ${style}`}
      >
        {mark}
      </div>
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <p className="max-w-sm text-muted">{message}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button onClick={onAgain}>Buy again</Button>
        <Link
          href="/dashboard/history"
          className="inline-flex items-center rounded-xl px-4 py-3 font-bold text-cobalt hover:bg-cobalt-soft"
        >
          View history
        </Link>
      </div>
    </div>
  );
}
