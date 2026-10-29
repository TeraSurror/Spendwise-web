import Link from "next/link";
import { monthLong, shiftMonth } from "@/lib/dates";

export function MonthNav({ month, basePath, current }: { month: string; basePath: string; current: string }) {
  const next = shiftMonth(month, 1);
  return (
    <div className="flex items-center gap-1">
      <Link href={`${basePath}?month=${shiftMonth(month, -1)}`} className="btn" aria-label="Previous month">‹</Link>
      <span className="min-w-32 text-center text-sm font-medium">{monthLong(month)}</span>
      {next <= current
        ? <Link href={`${basePath}?month=${next}`} className="btn" aria-label="Next month">›</Link>
        : <span className="btn opacity-40" aria-hidden>›</span>}
    </div>
  );
}
