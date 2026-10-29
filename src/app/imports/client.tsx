"use client";

import { useRef, useState, useTransition } from "react";
import { ACCOUNT_TYPES, type AccountType } from "@/db/enums";
import type { ImportOutcome } from "@/import/pipeline";
import { assignImportAccount, assignImportNewAccount, dismissImport, saveColumnMapping, undoImport, uploadFiles } from "../actions";

const TYPE_LABEL: Record<AccountType, string> = {
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit card",
  brokerage: "Brokerage",
};

function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      try { setError(null); await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    });
  return { pending, error, run };
}

const OUTCOME_STYLE: Record<ImportOutcome["status"], string> = {
  imported: "text-good",
  duplicate_file: "text-ink-2",
  unrecognized: "text-critical",
  needs_account: "text-critical",
  error: "text-critical",
};

export function Dropzone() {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [results, setResults] = useState<ImportOutcome[]>([]);
  const { pending, error, run } = useAction();

  const send = (files: FileList | File[]) => {
    const list = [...files].filter((f) => /\.(csv|txt)$/i.test(f.name));
    if (!list.length) return;
    const fd = new FormData();
    list.forEach((f) => fd.append("files", f));
    run(async () => setResults(await uploadFiles(fd)));
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); send(e.dataTransfer.files); }}
        className={`card flex w-full flex-col items-center gap-1 border-2 border-dashed p-8 text-center transition-colors ${over ? "bg-surface-2" : ""}`}
        style={{ borderColor: over ? "var(--series-1)" : undefined }}
      >
        <span className="font-medium">{pending ? "Importing…" : "Drop CSV exports here"}</span>
        <span className="text-ink-2 text-sm">or click to choose files. Chase, Amex, Capital One, Fidelity, Schwab and Vanguard are recognized automatically.</span>
      </button>
      <input ref={input} type="file" accept=".csv,.txt,text/csv" multiple hidden onChange={(e) => { if (e.target.files) send(e.target.files); e.target.value = ""; }} />
      {error && <p className="text-critical mt-2 text-sm">{error}</p>}
      {results.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-sm" role="status">
          {results.map((r) => (
            <li key={r.importId} className={OUTCOME_STYLE[r.status]}>
              {r.message}{r.transfersMatched ? ` · ${r.transfersMatched} transfer${r.transfersMatched === 1 ? "" : "s"} matched` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AccountPicker({ importId, presetLabel, accounts }: { importId: number; presetLabel: string; accounts: { id: number; name: string }[] }) {
  const [choice, setChoice] = useState<string>(accounts[0] ? String(accounts[0].id) : "new");
  const [name, setName] = useState(presetLabel);
  const { pending, error, run } = useAction();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-ink-2 flex flex-col gap-1 text-xs">Account
        <select className="input" value={choice} onChange={(e) => setChoice(e.target.value)}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          <option value="new">New account…</option>
        </select>
      </label>
      {choice === "new" && (
        <label className="text-ink-2 flex flex-col gap-1 text-xs">Name
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      )}
      <button
        className="btn btn-primary"
        disabled={pending}
        onClick={() => run(() => (choice === "new" ? assignImportNewAccount(importId, name) : assignImportAccount(importId, Number(choice))))}
      >Import into this account</button>
      {error && <p className="text-critical w-full text-sm">{error}</p>}
    </div>
  );
}

const guess = (headers: { key: string }[], re: RegExp) => headers.find((h) => re.test(h.key))?.key ?? "";

export function ColumnMapper({ importId, fileName, headers, sample }: {
  importId: number;
  fileName: string;
  headers: { raw: string; key: string }[];
  sample: string[][];
}) {
  const [label, setLabel] = useState(fileName.replace(/\.[^.]+$/, ""));
  const [institution, setInstitution] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("checking");
  const [dateColumn, setDate] = useState(guess(headers, /date|when|posted/));
  const [descriptionColumn, setDescription] = useState(guess(headers, /desc|what|merchant|payee|memo|name/));
  const [mode, setMode] = useState<"single" | "split">(guess(headers, /amount/) ? "single" : "split");
  const [amountColumn, setAmount] = useState(guess(headers, /amount/));
  const [debitColumn, setDebit] = useState(guess(headers, /debit|out|withdraw|charge/));
  const [creditColumn, setCredit] = useState(guess(headers, /credit|\bin\b|deposit|payment/));
  const [categoryColumn, setCategory] = useState(guess(headers, /categ/));
  const [invertSign, setInvert] = useState(false);
  const { pending, error, run } = useAction();

  const col = (value: string, set: (v: string) => void, labelText: string, optional = false) => (
    <label className="text-ink-2 flex flex-col gap-1 text-xs">{labelText}
      <select className="input" value={value} onChange={(e) => set(e.target.value)}>
        <option value="">{optional ? "None" : "Choose…"}</option>
        {headers.map((h) => <option key={h.key} value={h.key}>{h.raw}</option>)}
      </select>
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink-2 text-sm">Spendwise doesn't know this format yet. Map its columns once and files with the same headers import automatically from then on.</p>
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead><tr>{headers.map((h) => <th key={h.key} className="bg-surface-2 px-2 py-1 text-left font-medium">{h.raw}</th>)}</tr></thead>
          <tbody>{sample.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="border-line text-ink-2 border-b px-2 py-1 whitespace-nowrap">{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="text-ink-2 flex flex-col gap-1 text-xs">Format name
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label className="text-ink-2 flex flex-col gap-1 text-xs">Institution
          <input className="input" value={institution} placeholder="e.g. Ally" onChange={(e) => setInstitution(e.target.value)} />
        </label>
        <label className="text-ink-2 flex flex-col gap-1 text-xs">Account type
          <select className="input" value={accountType} onChange={(e) => setAccountType(e.target.value as AccountType)}>
            {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        {col(dateColumn, setDate, "Date")}
        {col(descriptionColumn, setDescription, "Description")}
        <label className="text-ink-2 flex flex-col gap-1 text-xs">Amounts are in
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value as "single" | "split")}>
            <option value="single">One column</option>
            <option value="split">Separate debit and credit columns</option>
          </select>
        </label>
        {mode === "single" ? col(amountColumn, setAmount, "Amount") : <>{col(debitColumn, setDebit, "Debit (money out)")}{col(creditColumn, setCredit, "Credit (money in)")}</>}
        {col(categoryColumn, setCategory, "Bank category", true)}
      </div>
      {mode === "single" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={invertSign} onChange={(e) => setInvert(e.target.checked)} />
          Purchases are positive in this file (flip the sign)
        </label>
      )}
      <div>
        <button
          className="btn btn-primary"
          disabled={pending || !institution.trim()}
          onClick={() => run(() => saveColumnMapping(importId, {
            label: label.trim() || institution,
            institution: institution.trim(),
            accountType,
            headers: headers.map((h) => h.key),
            dateColumn,
            descriptionColumn,
            ...(mode === "single" ? { amountColumn, invertSign } : { debitColumn, creditColumn }),
            categoryColumn: categoryColumn || undefined,
          }))}
        >Save mapping and import</button>
        {error && <p className="text-critical mt-2 text-sm">{error}</p>}
      </div>
    </div>
  );
}

export function ImportRowActions({ importId, status }: { importId: number; status: string }) {
  const { pending, error, run } = useAction();
  return (
    <span className="flex items-center justify-end gap-3 text-xs">
      {status === "imported" ? (
        <button
          className="text-accent"
          disabled={pending}
          onClick={() => { if (confirm("Remove every transaction this import added?")) run(() => undoImport(importId)); }}
        >Undo</button>
      ) : (
        <button className="text-accent" disabled={pending} onClick={() => run(() => dismissImport(importId))}>Dismiss</button>
      )}
      {error && <span className="text-critical">{error}</span>}
    </span>
  );
}
