"use client";

import { useState, useTransition } from "react";
import { KINDS, type Kind } from "@/db/enums";
import type { TxRow } from "@/lib/queries";
import {
  bulkSetCategory,
  createMerchantRule,
  splitTransaction,
  unsplitTransaction,
  updateTransaction,
  type RuleSuggestion,
} from "../actions";
import { Amount, KIND_LABEL } from "../components/ui";

interface Cat { id: number; name: string }

export function TransactionsTable({ rows, categories }: { rows: TxRow[]; categories: Cat[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [suggestion, setSuggestion] = useState<RuleSuggestion | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [splitting, setSplitting] = useState<TxRow | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      try { setNotice(null); await fn(); } catch (e) { setNotice(e instanceof Error ? e.message : String(e)); }
    });

  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  if (!rows.length) return <div className="card text-ink-2 p-8 text-center text-sm">No transactions match these filters.</div>;

  return (
    <div className="flex flex-col gap-3">
      {suggestion && (
        <div className="card flex flex-wrap items-center gap-3 p-3 text-sm">
          <span>
            Always categorize <strong>{suggestion.merchant}</strong> as <strong>{suggestion.categoryName}</strong>?
            {suggestion.matching > 0 && <span className="text-ink-2"> {suggestion.matching} other transaction{suggestion.matching === 1 ? "" : "s"} from this merchant.</span>}
          </span>
          <button className="btn btn-primary" disabled={pending} onClick={() => run(async () => {
            const changed = await createMerchantRule(suggestion.merchant, suggestion.categoryId, true);
            setSuggestion(null);
            setNotice(`Rule created${changed ? `; ${changed} past transaction${changed === 1 ? "" : "s"} updated` : ""}.`);
          })}>Create rule</button>
          <button className="btn" onClick={() => setSuggestion(null)}>Just this one</button>
        </div>
      )}

      {notice && <div className="card text-ink-2 p-3 text-sm" role="status">{notice}</div>}

      {selected.size > 0 && (
        <div className="card flex flex-wrap items-center gap-3 p-3 text-sm">
          <span>{selected.size} selected</span>
          <select className="input" defaultValue="" onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            run(async () => { await bulkSetCategory([...selected], Number(v)); setSelected(new Set()); });
            e.target.value = "";
          }}>
            <option value="">Set category…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn" onClick={() => setSelected(new Set())}>Clear selection</button>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="text-muted text-xs">
            <tr className="border-line border-b">
              <th className="w-8 p-3"><input type="checkbox" aria-label="Select all" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))} /></th>
              <th className="p-3 font-medium">Date</th>
              <th className="p-3 font-medium">Merchant</th>
              <th className="p-3 font-medium">Account</th>
              <th className="p-3 font-medium">Category</th>
              <th className="p-3 font-medium">Kind</th>
              <th className="p-3 text-right font-medium">Amount</th>
              <th className="p-3 font-medium">Note</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-line border-b last:border-0 ${r.isSplit ? "opacity-50" : ""}`}>
                <td className="p-3"><input type="checkbox" aria-label={`Select ${r.merchant}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="num p-3 whitespace-nowrap">{r.date}</td>
                <td className="max-w-64 p-3">
                  <div className="truncate font-medium" title={r.descriptionRaw}>{r.parentId ? "↳ " : ""}{r.merchant}</div>
                  <div className="text-muted truncate text-xs" title={r.descriptionRaw}>
                    {r.isSplit ? "Split into parts below" : r.descriptionRaw}
                    {r.transferGroupId ? " · matched transfer" : ""}
                  </div>
                </td>
                <td className="text-ink-2 p-3 whitespace-nowrap">{r.account}</td>
                <td className="p-3">
                  <select
                    className="input py-1"
                    aria-label="Category"
                    value={r.categoryId ?? ""}
                    disabled={pending || !!r.isSplit}
                    onChange={(e) => run(async () => {
                      const s = await updateTransaction(r.id, { categoryId: e.target.value ? Number(e.target.value) : null });
                      if (s && !r.parentId) setSuggestion(s);
                    })}
                  >
                    <option value="">—</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </td>
                <td className="p-3">
                  <select
                    className="input py-1"
                    aria-label="Kind"
                    value={r.kind}
                    disabled={pending || !!r.isSplit}
                    onChange={(e) => run(async () => { await updateTransaction(r.id, { kind: e.target.value as Kind }); })}
                  >
                    {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                  </select>
                </td>
                <td className="p-3 text-right"><Amount cents={r.amountCents} /></td>
                <td className="p-3">
                  <input
                    className="input w-36 py-1"
                    aria-label="Note"
                    defaultValue={r.notes ?? ""}
                    placeholder="Add note"
                    onBlur={(e) => {
                      if ((e.target.value || null) !== (r.notes || null)) run(async () => { await updateTransaction(r.id, { notes: e.target.value }); });
                    }}
                  />
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  {r.isSplit
                    ? <button className="text-accent text-xs" onClick={() => run(() => unsplitTransaction(r.id))}>Unsplit</button>
                    : !r.parentId && <button className="text-accent text-xs" onClick={() => setSplitting(r)}>Split</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {splitting && (
        <SplitDialog
          tx={splitting}
          categories={categories}
          onClose={() => setSplitting(null)}
          onSave={(parts) => run(async () => { await splitTransaction(splitting.id, parts); setSplitting(null); })}
          pending={pending}
        />
      )}
    </div>
  );
}

function SplitDialog({ tx, categories, onClose, onSave, pending }: {
  tx: TxRow;
  categories: Cat[];
  onClose: () => void;
  onSave: (parts: { amountCents: number; categoryId: number | null; notes?: string }[]) => void;
  pending: boolean;
}) {
  const sign = tx.amountCents < 0 ? -1 : 1;
  const total = Math.abs(tx.amountCents);
  const [parts, setParts] = useState([
    { dollars: (total / 100).toFixed(2), categoryId: tx.categoryId, notes: "" },
    { dollars: "0.00", categoryId: tx.categoryId, notes: "" },
  ]);
  const cents = parts.map((p) => Math.round(Number(p.dollars || 0) * 100));
  const remaining = total - cents.reduce((s, c) => s + c, 0);
  const valid = remaining === 0 && cents.every((c) => c > 0 && Number.isFinite(c));
  const set = (i: number, patch: Partial<(typeof parts)[number]>) => setParts((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal aria-label="Split transaction">
      <div className="card w-full max-w-lg p-5">
        <h2 className="font-semibold">Split {tx.merchant}</h2>
        <p className="text-ink-2 mb-4 text-sm">{tx.date} · total ${(total / 100).toFixed(2)}</p>
        <div className="flex flex-col gap-2">
          {parts.map((p, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <input className="input num w-28" inputMode="decimal" aria-label="Amount" value={p.dollars} onChange={(e) => set(i, { dollars: e.target.value })} />
              <select className="input flex-1" aria-label="Category" value={p.categoryId ?? ""} onChange={(e) => set(i, { categoryId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">—</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input className="input w-32" placeholder="Note" aria-label="Note" value={p.notes} onChange={(e) => set(i, { notes: e.target.value })} />
              {parts.length > 2 && <button className="btn" aria-label="Remove part" onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))}>×</button>}
            </div>
          ))}
        </div>
        <button className="text-accent mt-2 text-sm" onClick={() => setParts((ps) => [...ps, { dollars: "0.00", categoryId: tx.categoryId, notes: "" }])}>+ Add part</button>
        <p className={`mt-3 text-sm ${remaining === 0 ? "text-ink-2" : "text-critical"}`}>
          {remaining === 0 ? "Parts add up to the total." : `${remaining > 0 ? "Unassigned" : "Over by"}: $${(Math.abs(remaining) / 100).toFixed(2)}`}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={!valid || pending}
            onClick={() => onSave(parts.map((p, i) => ({ amountCents: sign * cents[i], categoryId: p.categoryId, notes: p.notes })))}
          >Save split</button>
        </div>
      </div>
    </div>
  );
}
