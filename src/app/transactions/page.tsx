import Link from "next/link";
import { getDb } from "@/db/client";
import { KINDS, accounts, categories, type Kind } from "@/db/schema";
import { parseDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { listTransactions } from "@/lib/queries";
import { KIND_LABEL, PageHeader } from "../components/ui";
import { TransactionsTable } from "./table";

const PAGE_SIZE = 100;

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const db = getDb();
  const page = Math.max(1, Number(sp.page) || 1);
  const filter = {
    q: sp.q?.trim() || undefined,
    accountId: Number(sp.account) || undefined,
    categoryId: Number(sp.category) || undefined,
    kind: KINDS.includes(sp.kind as Kind) ? (sp.kind as Kind) : undefined,
    from: parseDate(sp.from) ?? undefined,
    to: parseDate(sp.to) ?? undefined,
  };
  const { rows, total } = listTransactions(db, { ...filter, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const cats = db.select().from(categories).orderBy(categories.name).all();
  const accts = db.select().from(accounts).orderBy(accounts.name).all();
  const shownSum = rows.filter((r) => !r.isSplit).reduce((s, r) => s + r.amountCents, 0);

  const pageHref = (p: number) => {
    const params = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    params.set("page", String(p));
    return `/transactions?${params}`;
  };

  return (
    <>
      <PageHeader title="Transactions" subtitle={`${total.toLocaleString()} matching · ${formatCents(shownSum)} net on this page`} />

      <form className="card mb-4 flex flex-wrap items-end gap-3 p-3" method="get">
        <label className="flex flex-col gap-1 text-xs text-ink-2">Search
          <input name="q" defaultValue={sp.q} placeholder="Merchant, description, note" className="input w-56" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-2">Account
          <select name="account" defaultValue={sp.account ?? ""} className="input">
            <option value="">All accounts</option>
            {accts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-2">Category
          <select name="category" defaultValue={sp.category ?? ""} className="input">
            <option value="">All categories</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-2">Kind
          <select name="kind" defaultValue={sp.kind ?? ""} className="input">
            <option value="">All kinds</option>
            {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-2">From
          <input type="date" name="from" defaultValue={filter.from} className="input" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-2">To
          <input type="date" name="to" defaultValue={filter.to} className="input" />
        </label>
        <button className="btn btn-primary" type="submit">Filter</button>
        <Link href="/transactions" className="btn">Clear</Link>
      </form>

      <TransactionsTable rows={rows} categories={cats.map((c) => ({ id: c.id, name: c.name }))} />

      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          {page > 1 && <Link className="btn" href={pageHref(page - 1)}>‹ Newer</Link>}
          <span className="text-ink-2">Page {page} of {Math.ceil(total / PAGE_SIZE)}</span>
          {page * PAGE_SIZE < total && <Link className="btn" href={pageHref(page + 1)}>Older ›</Link>}
        </div>
      )}
    </>
  );
}
