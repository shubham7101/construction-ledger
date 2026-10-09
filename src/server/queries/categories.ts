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
 * Money per category: ledger credits, ledger debits and expenses. Spending
 * (debits + expenses) is what ranks categories and makes up each one's share;
 * credits are money received, so they're totalled apart and never count as
 * spending. Only categories with activity are returned, biggest spend first.
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
    .map((r) => ({ ...r, spent: r.debit + r.expense }))
    .filter((r) => r.spent > 0 || r.credit > 0)
    .sort(
      (a, b) =>
        b.spent - a.spent ||
        b.credit - a.credit ||
        a.name.localeCompare(b.name),
    );
  const spentTotal = rows.reduce((sum, r) => sum + r.spent, 0);
  const receivedTotal = rows.reduce((sum, r) => sum + r.credit, 0);

  return {
    spentTotal,
    receivedTotal,
    rows: rows.map((r) => ({
      ...r,
      /** This category's part of all spending (0 when nothing was spent). */
      share: spentTotal > 0 ? r.spent / spentTotal : 0,
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
  const scoped = {
    ...params,
    filter: { ...(params.filter ?? { dm: "any" as const }), categoryId },
  };
  const { ledgerWhere, expenseWhere } = await scopes(scoped);
  // In parallel: for an unknown category the totals are just discarded.
  const [[category], [ledger], [expense]] = await Promise.all([
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1),
    db
      .select({ credit: creditSum, debit: debitSum })
      .from(ledgerEntries)
      .where(and(ledgerWhere)),
    db.select({ total: expenseTotal }).from(expenses).where(expenseWhere),
  ]);
  if (!category) return null;

  return {
    category,
    credit: ledger?.credit ?? 0,
    debit: ledger?.debit ?? 0,
    expense: expense?.total ?? 0,
  };
}
