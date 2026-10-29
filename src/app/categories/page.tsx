import { getDb } from "@/db/client";
import { categories } from "@/db/schema";
import { todayIso } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { spendingByCategory } from "@/lib/queries";
import { createCategory, deleteCategory, updateCategory } from "../actions";
import { ActionButton, InlineCheckbox, InlineText } from "../components/inline";
import { PageHeader, Section } from "../components/ui";

const SYSTEM = new Set(["Uncategorized", "Transfers", "Investing", "Income"]);

export default async function CategoriesPage() {
  const db = getDb();
  const today = todayIso();
  const cats = db.select().from(categories).orderBy(categories.name).all();
  const ytd = new Map(spendingByCategory(db, `${today.slice(0, 4)}-01-01`, today).map((c) => [c.categoryId, c]));

  return (
    <>
      <PageHeader title="Categories" subtitle="Deleting a category moves its transactions to Uncategorized and removes rules that set it." />
      <div className="flex flex-col gap-4">
        <Section title="Categories">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-muted text-xs">
                <tr className="border-line border-b">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Essential</th>
                  <th className="py-2 pr-4 text-right font-medium">Spent this year</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {cats.map((c) => (
                  <tr key={c.id} className="border-line border-b last:border-0">
                    <td className="py-2 pr-4">
                      {SYSTEM.has(c.name) ? <span className="px-2">{c.name}</span> : (
                        <InlineText label="Category name" value={c.name} onSave={async (v) => { "use server"; await updateCategory(c.id, { name: v }); }} />
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <InlineCheckbox label={`${c.name} is essential`} checked={c.isEssential} onSave={async (v) => { "use server"; await updateCategory(c.id, { isEssential: v }); }} />
                    </td>
                    <td className="num py-2 pr-4 text-right">{ytd.get(c.id) ? formatCents(ytd.get(c.id)!.cents) : "—"}</td>
                    <td className="py-2 text-right">
                      {!SYSTEM.has(c.name) && <ActionButton onClick={deleteCategory.bind(null, c.id)} confirmText={`Delete ${c.name}?`}>Delete</ActionButton>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
        <Section title="Add a category">
          <form action={createCategory} className="flex flex-wrap items-end gap-3">
            <label className="text-ink-2 flex flex-col gap-1 text-xs">Name<input name="name" required className="input" placeholder="Pets" /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="essential" /> Essential</label>
            <button className="btn btn-primary" type="submit">Add</button>
          </form>
        </Section>
      </div>
    </>
  );
}
