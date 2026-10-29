import Link from "next/link";
import type { Kind } from "@/db/enums";
import { formatCents } from "@/lib/money";

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="text-ink-2 mt-1 text-sm">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function Section({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="card min-w-0 p-4 md:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && <p className="text-muted mt-0.5 text-xs">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** label · value · optional delta vs a named period. `upIsGood` decides the delta color. */
export function StatTile({ label, cents, delta, upIsGood = true, hint }: {
  label: string;
  cents: number;
  delta?: { cents: number; vs: string };
  upIsGood?: boolean;
  hint?: string;
}) {
  let deltaEl: React.ReactNode = null;
  if (delta && delta.cents !== 0) {
    const up = delta.cents > 0;
    const good = up === upIsGood;
    deltaEl = (
      <span className={`text-xs ${good ? "text-good" : "text-critical"}`}>
        {up ? "▲" : "▼"} {formatCents(Math.abs(delta.cents), { whole: true })} vs {delta.vs}
      </span>
    );
  }
  return (
    <div className="card flex flex-col gap-1 p-4">
      <span className="text-ink-2 text-sm">{label}</span>
      <span className="text-2xl font-semibold">{formatCents(cents, { whole: true })}</span>
      {deltaEl}
      {hint && <span className="text-muted text-xs">{hint}</span>}
    </div>
  );
}

/** Horizontal bars for one series (e.g. spending by category). Bars are links when `href` is given. */
export function BarList({ items, emptyText = "Nothing here yet" }: {
  items: { key: string | number; label: string; cents: number; href?: string; sub?: string }[];
  emptyText?: string;
}) {
  if (!items.length) return <p className="text-muted text-sm">{emptyText}</p>;
  const max = Math.max(...items.map((i) => i.cents), 1);
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((i) => {
        const body = (
          <>
            <div className="mb-1 flex justify-between gap-3 text-sm">
              <span className="truncate">{i.label}{i.sub && <span className="text-muted"> · {i.sub}</span>}</span>
              <span className="num shrink-0">{formatCents(i.cents)}</span>
            </div>
            <div className="bg-surface-2 h-2 rounded-full">
              <div className="h-2 rounded-full" style={{ width: `${Math.max((i.cents / max) * 100, 1)}%`, background: "var(--series-1)" }} />
            </div>
          </>
        );
        return (
          <li key={i.key} title={`${i.label}: ${formatCents(i.cents)}`}>
            {i.href ? <Link href={i.href} className="hover:bg-surface-2 -mx-2 block rounded-lg px-2 py-1">{body}</Link> : <div className="py-1">{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}

export function Amount({ cents, className = "" }: { cents: number; className?: string }) {
  return <span className={`num whitespace-nowrap ${cents > 0 ? "text-good" : ""} ${className}`}>{cents > 0 ? "+" : ""}{formatCents(cents)}</span>;
}

export const KIND_LABEL: Record<Kind, string> = {
  expense: "Expense",
  income: "Income",
  refund: "Refund",
  transfer: "Transfer",
  card_payment: "Card payment",
  contribution: "Contribution",
  withdrawal: "Withdrawal",
  investment_internal: "Inside brokerage",
};

/** A collapsible plain table behind every chart, so no value depends on reading color. */
export function TableView({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="text-muted cursor-pointer text-xs">Show as table</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-muted">
            <tr>{columns.map((c, i) => <th key={c} className={`py-1 pr-4 font-medium ${i > 0 ? "text-right" : ""}`}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-line border-t">
                {r.map((cell, j) => <td key={j} className={`num py-1 pr-4 ${j > 0 ? "text-right" : ""}`}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="card text-ink-2 p-8 text-center text-sm">{children}</div>;
}
