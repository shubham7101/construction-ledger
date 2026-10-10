import "server-only";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  expenseBalances,
  expenses,
  ledgerBalances,
  ledgerEntries,
  persons,
  sites,
  users,
} from "@/db/schema";
import type { CurrentUser } from "@/server/auth/jwt";
import { isShowAllUsers } from "@/server/permissions";
import {
  afterCursor,
  decodeCursor,
  PAGE_SIZE,
  type Page,
  toPage,
} from "./pagination";
import {
  balanceEntries,
  balanceExpense,
  balanceExpenses,
  balancesCover,
  countAll,
  escapeLike,
  expenseBalanceScope,
  expenseScope,
  expenseTotal,
  getAllowedSites,
  getListMirror,
  ledgerBalanceScope,
  ledgerScope,
  type ParsedFilters,
  type ScopeOptions,
  viewerBalanceCredit,
  viewerBalanceDebit,
  viewerCreditSum,
  viewerDebitSum,
  viewerPersonId,
  viewerType,
} from "./shared";

export interface ListParams {
  siteId: number;
  allUsers?: string;
  filter?: ParsedFilters;
  /** Ledgers: text search over person name / mobile and the note. */
  query?: string;
  user: CurrentUser;
}

/* ------------------------------------------------------------------ */
/* Ledgers                                                             */
/* ------------------------------------------------------------------ */

const SEARCH_TERM_LIMIT = 50;

async function listScope({
  siteId,
  allUsers,
  filter,
  user,
}: ListParams): Promise<ScopeOptions> {
  const everyone = isShowAllUsers(user, allUsers);
  // Entries other users log against the viewer's own person are theirs too.
  const [allowed, mirror] = await Promise.all([
    getAllowedSites(user),
    getListMirror(user, everyone, filter),
  ]);
  return { siteId, user, everyone, allowed, filter, mirror };
}

/** "credit" / "debit", or undefined for both. */
function typeFilter(filter?: ParsedFilters) {
  // accept "credit" / "Credit" / "all" / "All" regardless of how the URL was parsed
  const t = filter?.t?.toLowerCase();
  return t === "credit" || t === "debit" ? t : undefined;
}

/** Case-insensitive substring match on the person's name / mobile or the note. */
function ledgerSearch(scope: ScopeOptions, query?: string) {
  const term = query?.trim().toLowerCase().slice(0, SEARCH_TERM_LIMIT);
  if (!term) return undefined;
  const pattern = `%${escapeLike(term)}%`;
  return or(
    sql`lower(${ledgerEntries.note}) LIKE ${pattern} ESCAPE '!'`,
    inArray(
      viewerPersonId(scope),
      db
        .select({ id: persons.id })
        .from(persons)
        .where(
          or(
            sql`lower(${persons.name}) LIKE ${pattern} ESCAPE '!'`,
            sql`${persons.mobile} LIKE ${pattern} ESCAPE '!'`,
          ),
        ),
    ),
  );
}

function ledgersWhere(params: ListParams, scope: ScopeOptions) {
  const type = typeFilter(params.filter);
  return and(
    ledgerScope(scope),
    type ? eq(viewerType(scope), type) : undefined,
    ledgerSearch(scope, params.query),
  );
}

/** One page of ledger entries, newest first. */
export async function getLedgersPage(
  params: ListParams & { cursor?: string | null },
) {
  const cursor = decodeCursor(params.cursor);
  const scope = await listScope(params);
  // A mirrored entry reads from the viewer's side.
  const personId = viewerPersonId(scope);
  const rows = await db
    .select({
      id: ledgerEntries.id,
      personId,
      personName: persons.name,
      type: viewerType(scope),
      amount: ledgerEntries.amount,
      date: ledgerEntries.date,
      siteId: ledgerEntries.siteId,
      siteName: sites.name,
      category: categories.name,
      mode: ledgerEntries.mode,
      note: ledgerEntries.note,
      createdBy: users.name,
      createdByUserId: ledgerEntries.createdBy,
    })
    .from(ledgerEntries)
    .innerJoin(persons, eq(persons.id, personId))
    .leftJoin(sites, eq(ledgerEntries.siteId, sites.id))
    .innerJoin(categories, eq(ledgerEntries.categoryId, categories.id))
    .innerJoin(users, eq(ledgerEntries.createdBy, users.id))
    .where(
      and(
        ledgersWhere(params, scope),
        afterCursor(ledgerEntries.date, ledgerEntries.id, cursor),
      ),
    )
    .orderBy(desc(ledgerEntries.date), desc(ledgerEntries.id))
    .limit(PAGE_SIZE + 1);
  return toPage(rows, (r) => ({ date: r.date, kind: "", id: r.id }));
}

export type LedgerRow = Awaited<
  ReturnType<typeof getLedgersPage>
>["items"][number];

/**
 * Count and totals over the whole filtered list (not just the loaded page),
 * from ledger_balances unless a date / category / type filter needs the rows.
 */
export async function getLedgersSummary(params: ListParams) {
  const scope = await listScope(params);
  if (
    balancesCover(params.filter) &&
    !typeFilter(params.filter) &&
    !params.query?.trim()
  ) {
    const [row] = await db
      .select({
        count: balanceEntries,
        credit: viewerBalanceCredit(scope),
        debit: viewerBalanceDebit(scope),
      })
      .from(ledgerBalances)
      .where(ledgerBalanceScope(scope));
    return {
      count: row?.count ?? 0,
      credit: row?.credit ?? 0,
      debit: row?.debit ?? 0,
    };
  }
  const [row] = await db
    .select({
      count: countAll,
      credit: viewerCreditSum(scope),
      debit: viewerDebitSum(scope),
    })
    .from(ledgerEntries)
    .where(ledgersWhere(params, scope));
  return {
    count: row?.count ?? 0,
    credit: row?.credit ?? 0,
    debit: row?.debit ?? 0,
  };
}

/* ------------------------------------------------------------------ */
/* Expenses                                                            */
/* ------------------------------------------------------------------ */

async function expensesWhere(params: ListParams) {
  return expenseScope(await listScope(params));
}

/** One page of expenses, newest first. */
export async function getExpensesPage(
  params: ListParams & { cursor?: string | null },
) {
  const cursor = decodeCursor(params.cursor);
  const rows = await db
    .select({
      id: expenses.id,
      note: expenses.note,
      amount: expenses.amount,
      date: expenses.date,
      siteId: expenses.siteId,
      siteName: sites.name,
      category: categories.name,
      createdBy: users.name,
      createdByUserId: expenses.createdBy,
    })
    .from(expenses)
    .innerJoin(sites, eq(expenses.siteId, sites.id))
    .innerJoin(categories, eq(expenses.categoryId, categories.id))
    .innerJoin(users, eq(expenses.createdBy, users.id))
    .where(
      and(
        await expensesWhere(params),
        afterCursor(expenses.date, expenses.id, cursor),
      ),
    )
    .orderBy(desc(expenses.date), desc(expenses.id))
    .limit(PAGE_SIZE + 1);
  return toPage(rows, (r) => ({ date: r.date, kind: "", id: r.id }));
}

export type ExpenseRow = Awaited<
  ReturnType<typeof getExpensesPage>
>["items"][number];

/** As getLedgersSummary, from expense_balances when no filter needs the rows. */
export async function getExpensesSummary(params: ListParams) {
  if (balancesCover(params.filter)) {
    const [row] = await db
      .select({ count: balanceExpenses, total: balanceExpense })
      .from(expenseBalances)
      .where(expenseBalanceScope(await listScope(params)));
    return { count: row?.count ?? 0, total: row?.total ?? 0 };
  }
  const [row] = await db
    .select({ count: countAll, total: expenseTotal })
    .from(expenses)
    .where(await expensesWhere(params));
  return { count: row?.count ?? 0, total: row?.total ?? 0 };
}

export type { Page };
