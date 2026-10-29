import Link from "next/link";
import { getDb } from "@/db/client";
import { isMonth, monthBounds, monthLabel, monthRange } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { currentMonth, spendingByCategory, spendingByCategoryMonth, topMerchants } from "@/lib/queries";
import { StackedColumns } from "../components/charts";
import { MonthNav } from "../components/month-nav";
import { BarList, PageHeader, Section, TableView } from "../components/ui";

const RANGES = [3, 6, 12];
const SLOTS = 7; // categorical slots for named categories; the 8th position is "Other"

export default async function SpendingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const db = getDb();
  const now = currentMonth();
  const month = isMonth(sp.month) ? sp.month : now;
  const n = RANGES.includes(Number(sp.months)) ? Number(sp.months) : 6;
  const months = monthRange(month, n);
  const from = monthBounds(months[0])[0];
  const to = monthBounds(month)[1];
  const categoryId = Number(sp.category) || undefined;

  const totals = spendingByCategory(db, from, to);
  const grand = totals.reduce((s, c) => s + c.cents, 0);
  const byMonth = spendingByCategoryMonth(db, months);

  // Largest categories over the whole range get a slot; colors follow category id, not rank,
  // so a category keeps its color when the ranking shifts.
  const named = totals.filter((c) => c.cents > 0).slice(0, SLOTS).sort((a, b) => (a.categoryId ?? 0) - (b.categoryId ?? 0));
  const namedSet = new Set(named.map((c) => c.category));
  const series = named.map((c, i) => ({
    name: c.category,
    color: `var(--series-${i + 1})`,
    values: months.map((m) => byMonth.find((r) => r.month === m && r.category === c.category)?.cents ?? 0),
  }));
  const otherValues = months.map((m) => byMonth.filter((r) => r.month === m && !namedSet.has(r.category)).reduce((s, r) => s + r.cents, 0));
  if (otherValues.some((v) => v > 0)) series.push({ name: "Other", color: "var(--other)", values: otherValues });

  const selected = categoryId ? totals.find((c) => c.categoryId === categoryId) : undefined;
  const merchants = topMerchants(db, from, to, 12, categoryId);
  const qs = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams({ month, months: String(n), ...(categoryId ? { category: String(categoryId) } : {}) });
    for (const [k, v] of Object.entries(patch)) { if (v === undefined) p.delete(k); else p.set(k, String(v)); }
    return `/spending?${p}`;
  };

  return (
    <>
      <PageHeader title="Spending" subtitle={`${monthLabel(months[0])} – ${monthLabel(month)} · ${formatCents(grand)} total`}>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Link key={r} href={qs({ months: r })} className={`btn ${r === n ? "bg-surface-2 font-semibold" : ""}`}>{r} mo</Link>
          ))}
        </div>
        <MonthNav month={month} basePath={`/spending`} current={now} />
      </PageHeader>

      <div className="flex flex-col gap-4">
        <Section title="Spending by category" subtitle="Monthly, largest categories named; the rest grouped as Other">
          {series.length ? (
            <>
              <StackedColumns labels={months.map(monthLabel)} series={series} />
              <TableView
                columns={["Category", ...months.map(monthLabel)]}
                rows={series.map((s) => [s.name, ...s.values.map((v) => formatCents(v, { whole: true }))])}
              />
            </>
          ) : <p className="text-muted text-sm">No spending in this range.</p>}
        </Section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Categories" subtitle="Pick one to see its merchants">
            <BarList
              items={totals.map((c) => ({
                key: c.categoryId ?? "none",
                label: c.category,
                sub: grand ? `${Math.round((c.cents / grand) * 100)}%` : undefined,
                cents: c.cents,
                href: qs({ category: c.categoryId ?? undefined }),
              }))}
            />
          </Section>
          <Section
            title={selected ? `Top merchants in ${selected.category}` : "Top merchants"}
            subtitle={`${monthLabel(months[0])} – ${monthLabel(month)}`}
            action={selected && (
              <div className="flex gap-3 text-xs">
                <Link href={`/transactions?category=${categoryId}&from=${from}&to=${to}`} className="text-accent">Transactions →</Link>
                <Link href={qs({ category: undefined })} className="text-accent">All categories</Link>
              </div>
            )}
          >
            <BarList items={merchants.map((m) => ({ key: m.merchant, label: m.merchant, sub: `${m.count}×`, cents: m.cents, href: `/transactions?q=${encodeURIComponent(m.merchant)}&from=${from}&to=${to}` }))} />
          </Section>
        </div>
      </div>
    </>
  );
}
