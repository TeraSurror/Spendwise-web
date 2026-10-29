import Link from "next/link";
import { getDb } from "@/db/client";
import { monthLabel, monthRange } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { currentMonth, investedByAccount, investedByMonth, investedTotals, investingTransactions } from "@/lib/queries";
import { ColumnChart, TrendLine } from "../components/charts";
import { Amount, EmptyState, KIND_LABEL, PageHeader, Section, StatTile, TableView } from "../components/ui";

export default async function InvestingPage() {
  const db = getDb();
  const now = currentMonth();
  const totals = investedTotals(db);
  const accounts = investedByAccount(db);
  const txs = investingTransactions(db, 100);

  if (!txs.length) {
    return (
      <>
        <PageHeader title="Investing" />
        <EmptyState>
          No brokerage deposits yet. Import activity exports from Fidelity, Schwab or Vanguard on the{" "}
          <Link href="/imports" className="text-accent underline">Imports</Link> page. Transfers out of your bank to a brokerage count too.
        </EmptyState>
      </>
    );
  }

  const months = monthRange(now, 12);
  const flows = investedByMonth(db, months);
  const perMonth = months.map((m) => flows.filter((f) => f.month === m).reduce((s, f) => s + f.cents, 0));
  // Running total starts from everything invested before the window.
  const before = totals.allTime - perMonth.reduce((s, v) => s + v, 0);
  let running = before;
  const cumulative = months.map((m, i) => ({ label: monthLabel(m), cents: (running += perMonth[i]) }));

  return (
    <>
      <PageHeader
        title="Investing"
        subtitle="Money you moved into brokerage accounts, minus what you took out. Buys, sells and dividends inside an account don't count."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="This month" cents={totals.thisMonth} />
        <StatTile label="This year" cents={totals.ytd} />
        <StatTile label="All time, net" cents={totals.allTime} />
        <StatTile label="Deposited / withdrawn" cents={totals.contributed} hint={`${formatCents(totals.withdrawn, { whole: true })} withdrawn`} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Section title="Net invested per month" subtitle="Last 12 months">
          <ColumnChart name="Net invested" data={months.map((m, i) => ({ label: monthLabel(m), cents: perMonth[i] }))} />
          <TableView columns={["Month", "Net invested"]} rows={months.map((m, i) => [monthLabel(m), formatCents(perMonth[i])])} />
        </Section>
        <Section title="Total invested over time" subtitle="Running net contributions">
          <TrendLine name="Total invested" data={cumulative} />
          <TableView columns={["Month", "Running total"]} rows={cumulative.map((c) => [c.label, formatCents(c.cents)])} />
        </Section>
      </div>

      <div className="flex flex-col gap-4">
        <Section title="By account">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted text-xs">
                <tr className="border-line border-b">
                  <th className="py-2 pr-4 font-medium">Account</th>
                  <th className="py-2 pr-4 text-right font-medium">Deposited</th>
                  <th className="py-2 pr-4 text-right font-medium">Withdrawn</th>
                  <th className="py-2 pr-4 text-right font-medium">This year</th>
                  <th className="py-2 text-right font-medium">Net</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.accountId} className="border-line border-b last:border-0">
                    <td className="py-2 pr-4">{a.account}</td>
                    <td className="num py-2 pr-4 text-right">{formatCents(a.contributed)}</td>
                    <td className="num py-2 pr-4 text-right">{formatCents(a.withdrawn)}</td>
                    <td className="num py-2 pr-4 text-right">{formatCents(a.ytd)}</td>
                    <td className="num py-2 text-right font-medium">{formatCents(a.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {accounts.some((a) => a.account.endsWith("(bank side)")) && (
            <p className="text-muted mt-3 text-xs">
              “Bank side” rows are transfers to a brokerage seen only in a bank export. They move onto the brokerage account once you import its activity and the two are matched.
            </p>
          )}
        </Section>

        <Section title="Deposits and withdrawals" subtitle="The transactions behind these numbers">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <tbody>
                {txs.map((t) => (
                  <tr key={t.id} className="border-line border-b last:border-0">
                    <td className="num text-ink-2 py-2 pr-4 whitespace-nowrap">{t.date}</td>
                    <td className="py-2 pr-4">
                      <div className="font-medium">{t.account}</div>
                      <div className="text-muted max-w-md truncate text-xs" title={t.descriptionRaw}>{t.descriptionRaw}</div>
                    </td>
                    <td className="text-ink-2 py-2 pr-4">{KIND_LABEL[t.kind]}</td>
                    <td className="py-2 text-right"><Amount cents={t.amountCents} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </>
  );
}
