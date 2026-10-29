import { getDb } from "@/db/client";
import { ACCOUNT_TYPES } from "@/db/enums";
import { BUILT_IN_PRESETS } from "@/import/presets";
import { STALE_AFTER_DAYS, accountsWithFreshness } from "@/lib/queries";
import { createAccount, deleteAccount, updateAccount } from "../actions";
import { ActionButton, InlineSelect, InlineText } from "../components/inline";
import { PageHeader, Section } from "../components/ui";

const TYPE_LABEL = { checking: "Checking", savings: "Savings", credit_card: "Credit card", brokerage: "Brokerage" } as const;

export default async function AccountsPage() {
  const accts = accountsWithFreshness(getDb());
  return (
    <>
      <PageHeader title="Accounts" subtitle="Accounts are created automatically on first import. Rename them or fix their type here." />
      <div className="flex flex-col gap-4">
        <Section title="Your accounts">
          {accts.length === 0 ? <p className="text-muted text-sm">No accounts yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-muted text-xs">
                  <tr className="border-line border-b">
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">Institution</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 font-medium">Last 4</th>
                    <th className="py-2 pr-4 font-medium">Data through</th>
                    <th className="py-2 pr-4 text-right font-medium">Transactions</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {accts.map((a) => {
                    const stale = a.staleDays == null || a.staleDays > STALE_AFTER_DAYS;
                    return (
                      <tr key={a.id} className="border-line border-b last:border-0">
                        <td className="py-2 pr-4"><InlineText label="Account name" value={a.name} onSave={async (v) => { "use server"; await updateAccount(a.id, { name: v }); }} className="w-56" /></td>
                        <td className="text-ink-2 py-2 pr-4">{a.institution}</td>
                        <td className="py-2 pr-4"><AccountTypeSelect id={a.id} type={a.type} /></td>
                        <td className="num text-ink-2 py-2 pr-4">{a.last4 ?? "—"}</td>
                        <td className={`num py-2 pr-4 ${stale ? "text-critical" : "text-ink-2"}`}>
                          {a.lastDate ?? "No data"}{stale && <span className="ml-1" title={`No new transactions in over ${STALE_AFTER_DAYS} days`}>⚠</span>}
                        </td>
                        <td className="num py-2 pr-4 text-right">{a.txCount}</td>
                        <td className="py-2 text-right">
                          <ActionButton confirmText={`Delete ${a.name} and all ${a.txCount} of its transactions?`} onClick={deleteAccount.bind(null, a.id)}>Delete</ActionButton>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Add an account" subtitle="Only needed when you have two accounts of the same kind at one bank and the export doesn't say which is which.">
          <form action={createAccount} className="flex flex-wrap items-end gap-3">
            <label className="text-ink-2 flex flex-col gap-1 text-xs">Name<input name="name" required className="input" placeholder="Amex Gold" /></label>
            <label className="text-ink-2 flex flex-col gap-1 text-xs">Institution<input name="institution" required className="input" placeholder="Amex" /></label>
            <label className="text-ink-2 flex flex-col gap-1 text-xs">Type
              <select name="type" className="input">{ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select>
            </label>
            <label className="text-ink-2 flex flex-col gap-1 text-xs">Export format
              <select name="presetId" className="input">
                <option value="">None</option>
                {BUILT_IN_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <label className="text-ink-2 flex flex-col gap-1 text-xs">Last 4<input name="last4" className="input w-20" inputMode="numeric" maxLength={4} /></label>
            <button className="btn btn-primary" type="submit">Add account</button>
          </form>
        </Section>
      </div>
    </>
  );
}

function AccountTypeSelect({ id, type }: { id: number; type: (typeof ACCOUNT_TYPES)[number] }) {
  return (
    <InlineSelect
      label="Account type"
      value={type}
      options={ACCOUNT_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
      onSave={async (v) => { "use server"; await updateAccount(id, { type: v as (typeof ACCOUNT_TYPES)[number] }); }}
    />
  );
}
