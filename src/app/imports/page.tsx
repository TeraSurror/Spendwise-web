import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { accounts, imports } from "@/db/schema";
import { normalizeHeader, readCsv } from "@/import/csv";
import { allPresets } from "@/import/pipeline";
import { paths } from "@/lib/paths";
import { PageHeader, Section } from "../components/ui";
import { AccountPicker, ColumnMapper, Dropzone, ImportRowActions } from "./client";

const STATUS_LABEL: Record<string, string> = {
  imported: "Imported",
  duplicate_file: "Already imported",
  unrecognized: "Unknown format",
  needs_account: "Needs account",
  error: "Error",
};

/** The first row with two or more filled cells is taken as the header for the column mapper. */
function preview(content: string) {
  const cells = readCsv(content);
  const at = cells.findIndex((r) => r.filter((c) => c?.trim()).length >= 2);
  if (at < 0) return null;
  const keep = cells[at].map((h, i) => [normalizeHeader(h ?? ""), i] as const).filter(([key]) => key);
  const headers = keep.map(([key, i]) => ({ raw: cells[at][i].trim(), key }));
  const sample = cells.slice(at + 1, at + 4).map((r) => keep.map(([, i]) => r[i] ?? ""));
  return { headers, sample };
}

export default async function ImportsPage() {
  const db = getDb();
  const history = db.select({
    id: imports.id, fileName: imports.fileName, presetId: imports.presetId, status: imports.status,
    rowsTotal: imports.rowsTotal, rowsInserted: imports.rowsInserted, rowsDuplicate: imports.rowsDuplicate,
    error: imports.error, createdAt: imports.createdAt,
  }).from(imports).orderBy(desc(imports.id)).limit(200).all();
  const presetById = new Map(allPresets(db).map((p) => [p.id, p]));
  const allAccounts = db.select().from(accounts).orderBy(accounts.name).all();

  const pending = history.filter((h) => h.status === "unrecognized" || h.status === "needs_account");
  const pendingDetails = pending.map((h) => {
    const content = db.select({ content: imports.content }).from(imports).where(eq(imports.id, h.id)).get()?.content ?? "";
    const preset = h.presetId ? presetById.get(h.presetId) : undefined;
    return { ...h, preview: h.status === "unrecognized" ? preview(content) : null, preset };
  });

  return (
    <>
      <PageHeader
        title="Imports"
        subtitle={<>Drop CSV exports here, or save them into <code className="bg-surface-2 rounded px-1">{paths.inbox}</code> while <code className="bg-surface-2 rounded px-1">npm run watch</code> is running.</>}
      />

      <div className="flex flex-col gap-4">
        <Dropzone />

        {pendingDetails.map((p) => (
          <Section key={p.id} title={p.fileName} subtitle={p.error ?? undefined}>
            {p.status === "needs_account" && p.preset && (
              <AccountPicker
                importId={p.id}
                presetLabel={p.preset.label}
                accounts={allAccounts.filter((a) => a.type === p.preset!.accountType).map((a) => ({ id: a.id, name: a.name }))}
              />
            )}
            {p.status === "unrecognized" && p.preview && (
              <ColumnMapper importId={p.id} fileName={p.fileName} headers={p.preview.headers} sample={p.preview.sample} />
            )}
            {p.status === "unrecognized" && !p.preview && <p className="text-critical text-sm">This file doesn't look like a CSV table.</p>}
          </Section>
        ))}

        <Section title="History">
          {history.length === 0 ? <p className="text-muted text-sm">Nothing imported yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-muted text-xs">
                  <tr className="border-line border-b">
                    <th className="py-2 pr-4 font-medium">When</th>
                    <th className="py-2 pr-4 font-medium">File</th>
                    <th className="py-2 pr-4 font-medium">Format</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 text-right font-medium">New</th>
                    <th className="py-2 pr-4 text-right font-medium">Duplicates</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-line border-b last:border-0">
                      <td className="num text-ink-2 py-2 pr-4 whitespace-nowrap">{new Date(h.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                      <td className="max-w-64 truncate py-2 pr-4" title={h.error ?? h.fileName}>{h.fileName}</td>
                      <td className="text-ink-2 py-2 pr-4">{h.presetId ? presetById.get(h.presetId)?.label ?? h.presetId : "—"}</td>
                      <td className={`py-2 pr-4 ${h.status === "error" ? "text-critical" : ""}`}>{STATUS_LABEL[h.status] ?? h.status}</td>
                      <td className="num py-2 pr-4 text-right">{h.status === "imported" ? h.rowsInserted : ""}</td>
                      <td className="num py-2 pr-4 text-right">{h.status === "imported" ? h.rowsDuplicate : ""}</td>
                      <td className="py-2 text-right"><ImportRowActions importId={h.id} status={h.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </>
  );
}
