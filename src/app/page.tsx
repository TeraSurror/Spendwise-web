import Link from "next/link";
import { getDb } from "@/db/client";
import { isMonth, monthBounds, monthLabel, monthLong } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { STALE_AFTER_DAYS, currentMonth, investedTotals, monthSummary, monthlySpending, spendingByCategory, staleAccounts } from "@/lib/queries";
import { ColumnChart } from "./components/charts";
import { MonthNav } from "./components/month-nav";
import { BarList, EmptyState, PageHeader, Section, StatTile, TableView } from "./components/ui";

export default async function Overview({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const db = getDb();
  const now = currentMonth();
  const month = isMonth(sp.month) ? sp.month : now;
  const [from, to] = monthBounds(month);

  const summary = monthSummary(db, month);
  const history = monthlySpending(db, month, 7);
  // Comparisons only use months that actually have imported data.
  const prior = history.slice(0, 6).filter((m) => m.count > 0);
  const last = history[5].count > 0 ? history[5] : null;
  const avg = prior.length ? Math.round(prior.reduce((s, m) => s + m.spending, 0) / prior.length) : null;
  const categories = spendingByCategory(db, from, to);
  const invested = investedTotals(db);
  const stale = staleAccounts(db);
  const hasData = db.$client.prepare("SELECT 1 FROM transactions LIMIT 1").get();

  if (!hasData) {
    return (
      <>
        <PageHeader title="Overview" />
        <EmptyState>
          No transactions yet. Export CSVs from your bank, card and brokerage sites and drop them on the{" "}
          <Link href="/imports" className="text-accent underline">Imports</Link> page, or save them into <code>~/Spendwise/inbox</code>.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Overview" subtitle="Spending excludes card payments, transfers and brokerage deposits.">
        <MonthNav month={month} basePath="/" current={now} />
      </PageHeader>

      {stale.length > 0 && (
        <div className="card mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 border-l-4 p-3 text-sm" style={{ borderLeftColor: "var(--warning)" }}>
          <span aria-hidden>⚠</span>
          <span className="font-medium">Time to export:</span>
          <span className="text-ink-2">
            {stale.map((a) => `${a.name} (${a.staleDays == null ? "no data" : `${a.staleDays} days old`})`).join(", ")}
          </span>
          <span className="text-muted text-xs">Flagged after {STALE_AFTER_DAYS} days without new transactions.</span>
        </div>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-[1.2fr_2fr]">
        <div className="card flex flex-col justify-center gap-2 p-5">
          <span className="text-ink-2 text-sm">Spent in {monthLong(month)}</span>
          <span className="text-5xl font-semibold">{formatCents(summary.spending, { whole: true })}</span>
          <div className="text-ink-2 flex flex-col gap-0.5 text-sm">
            {last && <Delta cents={summary.spending - last.spending} vs="last month" />}
            {avg != null && <Delta cents={summary.spending - avg} vs={prior.length === 6 ? "6-month average" : `${prior.length}-month average`} />}
            {!last && avg == null && <span className="text-muted">Import earlier months to compare.</span>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <StatTile label="Income" cents={summary.income} delta={last ? { cents: summary.income - last.income, vs: "last month" } : undefined} />
          <StatTile label="Net cash flow" cents={summary.net} hint="Income minus spending" />
          <StatTile label="Invested this month" cents={summary.invested} hint="Net brokerage contributions" />
          <StatTile label="Invested this year" cents={invested.ytd} hint={`${formatCents(invested.allTime, { whole: true })} all time`} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Monthly spending" subtitle="Last 7 months">
          <ColumnChart name="Spending" data={history.map((m) => ({ label: monthLabel(m.month), cents: m.spending }))} />
          <TableView
            columns={["Month", "Spending", "Income"]}
            rows={history.map((m) => [monthLabel(m.month), formatCents(m.spending), formatCents(m.income)])}
          />
        </Section>
        <Section title="Top categories" subtitle={monthLong(month)} action={<Link href={`/spending?month=${month}`} className="text-accent text-xs">All spending →</Link>}>
          <BarList
            emptyText="No spending this month"
            items={categories.slice(0, 8).map((c) => ({
              key: c.categoryId ?? "none",
              label: c.category,
              sub: `${c.count}`,
              cents: c.cents,
              href: `/transactions?category=${c.categoryId ?? ""}&from=${from}&to=${to}`,
            }))}
          />
        </Section>
      </div>
    </>
  );
}

/** Spending going up is bad, so "up" renders in the critical color. */
function Delta({ cents, vs }: { cents: number; vs: string }) {
  if (cents === 0) return <span className="text-muted">Same as {vs}</span>;
  const up = cents > 0;
  return (
    <span className={up ? "text-critical" : "text-good"}>
      {up ? "▲" : "▼"} {formatCents(Math.abs(cents), { whole: true })} {up ? "more" : "less"} than {vs}
    </span>
  );
}
