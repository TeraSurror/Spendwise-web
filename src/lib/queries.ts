import type { DB } from "../db/client";
import type { Account, Kind } from "../db/schema";
import { daysBetween, monthOf, monthRange, todayIso } from "./dates";

// Split parents are kept for dedupe but their parts carry the real amounts.
const LIVE = "t.is_split = 0";
const SPENDING = `${LIVE} AND t.kind IN ('expense','refund')`;
const INVEST_FLOW = `${LIVE} AND t.kind IN ('contribution','withdrawal')`;

/**
 * Net invested: on brokerage accounts, contributions (+) and withdrawals (-) as recorded;
 * on bank accounts, only flows not yet matched to a brokerage row, sign flipped.
 * Matched bank-side rows become kind 'transfer', so nothing is counted twice.
 */
const INVESTED_CENTS = `CASE WHEN a.type = 'brokerage' THEN t.amount_cents ELSE -t.amount_cents END`;

type Row = Record<string, unknown>;
const all = <T>(db: DB, sql: string, ...params: unknown[]) => db.$client.prepare(sql).all(...params) as T[];
const get = <T>(db: DB, sql: string, ...params: unknown[]) => db.$client.prepare(sql).get(...params) as T;

export const currentMonth = () => monthOf(todayIso());

export interface MonthSummary {
  spending: number;
  income: number;
  net: number;
  invested: number;
}

export function monthSummary(db: DB, ym: string): MonthSummary {
  const r = get<{ spending: number | null; income: number | null; invested: number | null }>(db, `
    SELECT
      -SUM(CASE WHEN ${SPENDING} THEN t.amount_cents END) AS spending,
      SUM(CASE WHEN ${LIVE} AND t.kind = 'income' THEN t.amount_cents END) AS income,
      SUM(CASE WHEN ${INVEST_FLOW} THEN ${INVESTED_CENTS} END) AS invested
    FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE substr(t.date, 1, 7) = ?`, ym);
  const spending = r.spending ?? 0;
  const income = r.income ?? 0;
  return { spending, income, net: income - spending, invested: r.invested ?? 0 };
}

export interface CategoryMonth { month: string; category: string; cents: number }

export function spendingByCategoryMonth(db: DB, months: string[]): CategoryMonth[] {
  if (!months.length) return [];
  return all<CategoryMonth>(db, `
    SELECT substr(t.date, 1, 7) AS month, COALESCE(c.name, 'Uncategorized') AS category, -SUM(t.amount_cents) AS cents
    FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
    WHERE ${SPENDING} AND substr(t.date, 1, 7) BETWEEN ? AND ?
    GROUP BY month, category ORDER BY month, cents DESC`, months[0], months[months.length - 1]);
}

export interface CategoryTotal { categoryId: number | null; category: string; cents: number; count: number }

export function spendingByCategory(db: DB, from: string, to: string): CategoryTotal[] {
  return all<CategoryTotal>(db, `
    SELECT t.category_id AS categoryId, COALESCE(c.name, 'Uncategorized') AS category,
           -SUM(t.amount_cents) AS cents, COUNT(*) AS count
    FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
    WHERE ${SPENDING} AND t.date BETWEEN ? AND ?
    GROUP BY t.category_id ORDER BY cents DESC`, from, to);
}

export interface MerchantTotal { merchant: string; cents: number; count: number }

export function topMerchants(db: DB, from: string, to: string, limit = 10, categoryId?: number): MerchantTotal[] {
  return all<MerchantTotal>(db, `
    SELECT t.merchant AS merchant, -SUM(t.amount_cents) AS cents, COUNT(*) AS count
    FROM transactions t
    WHERE ${SPENDING} AND t.date BETWEEN ? AND ? ${categoryId != null ? "AND t.category_id = ?" : ""}
    GROUP BY t.merchant ORDER BY cents DESC LIMIT ?`,
    ...[from, to, ...(categoryId != null ? [categoryId] : []), limit]);
}

/** Spending totals for the last `n` months ending at `endYm`, zero-filled. */
export function monthlySpending(db: DB, endYm: string, n: number): { month: string; spending: number; income: number; count: number }[] {
  const months = monthRange(endYm, n);
  const rows = all<{ month: string; spending: number | null; income: number | null; count: number }>(db, `
    SELECT substr(t.date, 1, 7) AS month, COUNT(*) AS count,
      -SUM(CASE WHEN ${SPENDING} THEN t.amount_cents END) AS spending,
      SUM(CASE WHEN ${LIVE} AND t.kind = 'income' THEN t.amount_cents END) AS income
    FROM transactions t WHERE substr(t.date, 1, 7) BETWEEN ? AND ? GROUP BY month`, months[0], months[months.length - 1]);
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return months.map((m) => ({ month: m, spending: byMonth.get(m)?.spending ?? 0, income: byMonth.get(m)?.income ?? 0, count: byMonth.get(m)?.count ?? 0 }));
}

export interface InvestMonth { month: string; accountId: number; account: string; cents: number }

export function investedByMonth(db: DB, months: string[]): InvestMonth[] {
  if (!months.length) return [];
  return all<InvestMonth>(db, `
    SELECT substr(t.date, 1, 7) AS month, a.id AS accountId,
           CASE WHEN a.type = 'brokerage' THEN a.name ELSE a.name || ' (bank side)' END AS account,
           SUM(${INVESTED_CENTS}) AS cents
    FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE ${INVEST_FLOW} AND substr(t.date, 1, 7) BETWEEN ? AND ?
    GROUP BY month, a.id ORDER BY month`, months[0], months[months.length - 1]);
}

export interface InvestTotals { thisMonth: number; ytd: number; allTime: number; contributed: number; withdrawn: number }

export function investedTotals(db: DB, today = todayIso()): InvestTotals {
  const r = get<Record<keyof InvestTotals, number | null>>(db, `
    SELECT
      SUM(CASE WHEN substr(t.date, 1, 7) = ? THEN ${INVESTED_CENTS} END) AS thisMonth,
      SUM(CASE WHEN substr(t.date, 1, 4) = ? THEN ${INVESTED_CENTS} END) AS ytd,
      SUM(${INVESTED_CENTS}) AS allTime,
      SUM(CASE WHEN ${INVESTED_CENTS} > 0 THEN ${INVESTED_CENTS} END) AS contributed,
      -SUM(CASE WHEN ${INVESTED_CENTS} < 0 THEN ${INVESTED_CENTS} END) AS withdrawn
    FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE ${INVEST_FLOW}`, today.slice(0, 7), today.slice(0, 4));
  return { thisMonth: r.thisMonth ?? 0, ytd: r.ytd ?? 0, allTime: r.allTime ?? 0, contributed: r.contributed ?? 0, withdrawn: r.withdrawn ?? 0 };
}

export interface InvestByAccount { accountId: number; account: string; contributed: number; withdrawn: number; net: number; ytd: number }

export function investedByAccount(db: DB, today = todayIso()): InvestByAccount[] {
  return all<InvestByAccount>(db, `
    SELECT a.id AS accountId,
      CASE WHEN a.type = 'brokerage' THEN a.name ELSE a.name || ' (bank side)' END AS account,
      COALESCE(SUM(CASE WHEN ${INVESTED_CENTS} > 0 THEN ${INVESTED_CENTS} END), 0) AS contributed,
      COALESCE(-SUM(CASE WHEN ${INVESTED_CENTS} < 0 THEN ${INVESTED_CENTS} END), 0) AS withdrawn,
      SUM(${INVESTED_CENTS}) AS net,
      COALESCE(SUM(CASE WHEN substr(t.date, 1, 4) = ? THEN ${INVESTED_CENTS} END), 0) AS ytd
    FROM transactions t JOIN accounts a ON a.id = t.account_id
    WHERE ${INVEST_FLOW}
    GROUP BY a.id ORDER BY net DESC`, today.slice(0, 4));
}

export interface AccountFreshness extends Account { lastDate: string | null; txCount: number; staleDays: number | null }

export function accountsWithFreshness(db: DB, today = todayIso()): AccountFreshness[] {
  const rows = all<Row>(db, `
    SELECT a.*, MAX(t.date) AS lastDate, COUNT(t.id) AS txCount
    FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id
    GROUP BY a.id ORDER BY a.type, a.name`);
  return rows.map((r) => ({
    id: r.id as number,
    name: r.name as string,
    institution: r.institution as string,
    type: r.type as Account["type"],
    last4: (r.last4 as string) ?? null,
    presetId: (r.preset_id as string) ?? null,
    createdAt: r.created_at as string,
    lastDate: (r.lastDate as string) ?? null,
    txCount: r.txCount as number,
    staleDays: r.lastDate ? daysBetween(r.lastDate as string, today) : null,
  }));
}

export const STALE_AFTER_DAYS = 35;

export function staleAccounts(db: DB, today = todayIso(), days = STALE_AFTER_DAYS): AccountFreshness[] {
  return accountsWithFreshness(db, today).filter((a) => a.staleDays == null || a.staleDays > days);
}

export interface TxFilter {
  q?: string;
  accountId?: number;
  categoryId?: number;
  kind?: Kind;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface TxRow {
  id: number;
  date: string;
  amountCents: number;
  merchant: string;
  descriptionRaw: string;
  kind: Kind;
  categoryId: number | null;
  category: string | null;
  accountId: number;
  account: string;
  notes: string | null;
  transferGroupId: string | null;
  parentId: number | null;
  isSplit: number;
  manual: number;
}

export function listTransactions(db: DB, f: TxFilter): { rows: TxRow[]; total: number } {
  const where: string[] = ["1 = 1"];
  const params: unknown[] = [];
  if (f.q) { where.push("(t.merchant LIKE ? OR t.description_raw LIKE ? OR t.notes LIKE ?)"); params.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`); }
  if (f.accountId) { where.push("t.account_id = ?"); params.push(f.accountId); }
  if (f.categoryId) { where.push("t.category_id = ?"); params.push(f.categoryId); }
  if (f.kind) { where.push("t.kind = ?"); params.push(f.kind); }
  if (f.from) { where.push("t.date >= ?"); params.push(f.from); }
  if (f.to) { where.push("t.date <= ?"); params.push(f.to); }
  const clause = where.join(" AND ");
  const total = get<{ n: number }>(db, `SELECT COUNT(*) AS n FROM transactions t WHERE ${clause}`, ...params).n;
  const rows = all<TxRow>(db, `
    SELECT t.id, t.date, t.amount_cents AS amountCents, t.merchant, t.description_raw AS descriptionRaw, t.kind,
           t.category_id AS categoryId, c.name AS category, t.account_id AS accountId, a.name AS account,
           t.notes, t.transfer_group_id AS transferGroupId, t.parent_id AS parentId, t.is_split AS isSplit, t.manual
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE ${clause}
    ORDER BY t.date DESC, t.id DESC
    LIMIT ? OFFSET ?`, ...params, f.limit ?? 100, f.offset ?? 0);
  return { rows, total };
}

export function investingTransactions(db: DB, limit = 200): TxRow[] {
  return all<TxRow>(db, `
    SELECT t.id, t.date, t.amount_cents AS amountCents, t.merchant, t.description_raw AS descriptionRaw, t.kind,
           t.category_id AS categoryId, c.name AS category, t.account_id AS accountId, a.name AS account,
           t.notes, t.transfer_group_id AS transferGroupId, t.parent_id AS parentId, t.is_split AS isSplit, t.manual
    FROM transactions t JOIN accounts a ON a.id = t.account_id LEFT JOIN categories c ON c.id = t.category_id
    WHERE ${INVEST_FLOW}
    ORDER BY t.date DESC, t.id DESC LIMIT ?`, limit);
}

/** The most recent month that has any transactions, or the current month. */
export function latestDataMonth(db: DB): string {
  const r = get<{ d: string | null }>(db, "SELECT MAX(date) AS d FROM transactions WHERE is_split = 0");
  return r.d ? monthOf(r.d) : currentMonth();
}
