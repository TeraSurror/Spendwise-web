import { desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { KINDS } from "@/db/enums";
import { accounts, categories, rules, type Rule } from "@/db/schema";
import { formatCents } from "@/lib/money";
import { createRule, deleteRule, runRulesNow } from "../actions";
import { ActionButton } from "../components/inline";
import { KIND_LABEL, PageHeader, Section } from "../components/ui";

export default async function RulesPage() {
  const db = getDb();
  const all = db.select().from(rules).orderBy(desc(rules.priority), rules.id).all();
  const cats = db.select().from(categories).orderBy(categories.name).all();
  const accts = db.select().from(accounts).orderBy(accounts.name).all();
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const acctName = new Map(accts.map((a) => [a.id, a.name]));
  const mine = all.filter((r) => !r.isDefault);
  const defaults = all.filter((r) => r.isDefault);

  const describe = (r: Rule) => {
    const parts = [`${r.matchField} ${r.matchType === "contains" ? "contains" : r.matchType === "equals" ? "is" : "matches"} “${r.pattern}”`];
    if (r.amountMinCents != null && r.amountMaxCents != null) parts.push(`amount ${formatCents(r.amountMinCents)} to ${formatCents(r.amountMaxCents)}`);
    else if (r.amountMinCents != null) parts.push(r.amountMinCents === 1 ? "money in" : `amount ≥ ${formatCents(r.amountMinCents)}`);
    else if (r.amountMaxCents != null) parts.push(r.amountMaxCents === -1 ? "money out" : `amount ≤ ${formatCents(r.amountMaxCents)}`);
    if (r.accountId) parts.push(`in ${acctName.get(r.accountId) ?? "deleted account"}`);
    if (r.accountType) parts.push(`on ${r.accountType.replace("_", " ")} accounts`);
    return parts.join(", ");
  };
  const effect = (r: Rule) => [r.setCategoryId ? catName.get(r.setCategoryId) : null, r.setKind ? KIND_LABEL[r.setKind] : null].filter(Boolean).join(" · ");

  const table = (list: Rule[], deletable: boolean) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] text-left text-sm">
        <tbody>
          {list.map((r) => (
            <tr key={r.id} className="border-line border-b last:border-0">
              <td className="py-2 pr-4">{describe(r)}</td>
              <td className="text-ink-2 py-2 pr-4">→ {effect(r)}</td>
              <td className="num text-muted py-2 pr-4 text-xs">priority {r.priority}</td>
              <td className="py-2 text-right"><ActionButton onClick={deleteRule.bind(null, r.id)} confirmText={deletable ? undefined : "Delete this built-in rule?"}>Delete</ActionButton></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <PageHeader title="Rules" subtitle="Your rules run first, then the built-in ones, then the bank's own category. Transactions you edited by hand are left alone.">
        <ActionButton className="btn" onClick={runRulesNow}>Re-run rules on past transactions</ActionButton>
      </PageHeader>
      <div className="flex flex-col gap-4">
        <Section title="New rule">
          <form action={createRule} className="flex flex-wrap items-end gap-3">
            <label className="text-ink-2 flex flex-col gap-1 text-xs">When
              <select name="matchField" className="input"><option value="description">Description</option><option value="merchant">Merchant</option></select>
            </label>
            <label className="text-ink-2 flex flex-col gap-1 text-xs">Match
              <select name="matchType" className="input"><option value="contains">contains</option><option value="equals">is exactly</option><option value="regex">matches regex</option></select>
            </label>
            <label className="text-ink-2 flex flex-col gap-1 text-xs">Text<input name="pattern" required className="input w-48" placeholder="BLUE BOTTLE" /></label>
            <label className="text-ink-2 flex flex-col gap-1 text-xs">Min $<input name="amountMin" className="input w-24" inputMode="decimal" placeholder="-100" /></label>
            <label className="text-ink-2 flex flex-col gap-1 text-xs">Max $<input name="amountMax" className="input w-24" inputMode="decimal" placeholder="0" /></label>
            <label className="text-ink-2 flex flex-col gap-1 text-xs">Account
              <select name="accountId" className="input"><option value="">Any</option>{accts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            </label>
            <label className="text-ink-2 flex flex-col gap-1 text-xs">Set category
              <select name="categoryId" className="input"><option value="">Leave</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </label>
            <label className="text-ink-2 flex flex-col gap-1 text-xs">Set kind
              <select name="kind" className="input"><option value="">Leave</option>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
            </label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="applyNow" defaultChecked /> Apply to past transactions</label>
            <button className="btn btn-primary" type="submit">Add rule</button>
          </form>
          <p className="text-muted mt-2 text-xs">Amounts are signed: money out is negative. A max of 0 limits the rule to purchases.</p>
        </Section>

        <Section title={`Your rules (${mine.length})`}>
          {mine.length ? table(mine, true) : <p className="text-muted text-sm">None yet. Changing a transaction&apos;s category offers to create one.</p>}
        </Section>

        <Section title={`Built-in rules (${defaults.length})`}>
          <details>
            <summary className="text-muted cursor-pointer text-xs">Show built-in rules</summary>
            <div className="mt-2">{table(defaults, false)}</div>
          </details>
        </Section>
      </div>
    </>
  );
}
