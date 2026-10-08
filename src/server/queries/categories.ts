import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, expenses, ledgerEntries } from "@/db/schema";
import type { CurrentUser } from "@/server/auth/jwt";
import { isShowAllUsers } from "@/server/permissions";
import {
  creditSum,
  debitSum,
  expenseScope,
  expenseTotal,
  getAllowedSites,
  ledgerScope,
  type ParsedFilters,
} from "./shared";

interface CategoryParams {
  siteId: number; // -1 = all the user's sites
  allUsers?: string;
  filter?: ParsedFilters;
  user: CurrentUser;
}

async function scopes({ siteId, allUsers, filter, user }: CategoryParams) {
  const allowed = await getAllowedSites(user);
  const opts = {
    siteId,
    user,
    everyone: isShowAllUsers(user, allUsers),
    allowed,
    filter,
  };
  return { ledgerWhere: ledgerScope(opts), expenseWhere: expenseScope(opts) };
}

/**
 * Money per category: ledger credits, ledger debits and expenses, plus their
 * total and each category's share of the grand total. Only categories with
 * activity are returned, largest first.
 */
export async function getCategoryBreakdown(params: CategoryParams) {
  const { ledgerWhere, expenseWhere } = await scopes(params);

  const [cats, ledgerRows, expenseRows] = await Promise.all([
    db.select({ id: categories.id, name: categories.name }).from(categories),
    db
      .select({
        categoryId: ledgerEntries.categoryId,
        credit: creditSum,
        debit: debitSum,
      })
      .from(ledgerEntries)
      .where(ledgerWhere)
      .groupBy(ledgerEntries.categoryId),
    db
      .select({ categoryId: expenses.categoryId, expense: expenseTotal })
      .from(expenses)
      .where(expenseWhere)
      .groupBy(expenses.categoryId),
  ]);

  const byId = new Map(
    cats.map((c) => [
      c.id,
      { id: c.id, name: c.name, credit: 0, debit: 0, expense: 0 },
    ]),
  );
  for (const r of ledgerRows) {
    const row = byId.get(r.categoryId);
    if (row) Object.assign(row, { credit: r.credit, debit: r.debit });
  }
  for (const r of expenseRows) {
    const row = byId.get(r.categoryId);
    if (row) row.expense = r.expense;
  }

  const rows = [...byId.values()]
    .map((r) => ({ ...r, total: r.credit + r.debit + r.expense }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

  return {
    grandTotal,
    rows: rows.map((r) => ({
      ...r,
      share: grandTotal > 0 ? r.total / grandTotal : 0,
    })),
  };
}

export type CategoryBreakdownRow = Awaited<
  ReturnType<typeof getCategoryBreakdown>
>["rows"][number];

/** One category's name and totals in scope, for its drill-down page. */
export async function getCategorySummary(
  categoryId: number,
  params: CategoryParams,
) {
  const [category] = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);
  if (!category) return null;

  const scoped = {
    ...params,
    filter: { ...(params.filter ?? { dm: "any" as const }), categoryId },
  };
  const { ledgerWhere, expenseWhere } = await scopes(scoped);
  const [[ledger], [expense]] = await Promise.all([
    db
      .select({ credit: creditSum, debit: debitSum })
      .from(ledgerEntries)
      .where(and(ledgerWhere)),
    db.select({ total: expenseTotal }).from(expenses).where(expenseWhere),
  ]);

  return {
    category,
    credit: ledger?.credit ?? 0,
    debit: ledger?.debit ?? 0,
    expense: expense?.total ?? 0,
  };
}
