import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  expenses,
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
  countAll,
  creditSum,
  debitSum,
  expenseScope,
  expenseTotal,
  getAllowedSites,
  ledgerScope,
  type ParsedFilters,
} from "./shared";

export interface ListParams {
  siteId: number;
  allUsers?: string;
  filter?: ParsedFilters;
  user: CurrentUser;
}

/* ------------------------------------------------------------------ */
/* Ledgers                                                             */
/* ------------------------------------------------------------------ */

async function ledgersWhere({ siteId, allUsers, filter, user }: ListParams) {
  const allowed = await getAllowedSites(user);
  // accept "credit" / "Credit" / "all" / "All" regardless of how the URL was parsed
  const typeFilter = filter?.t?.toLowerCase();
  return and(
    ledgerScope({
      siteId,
      user,
      everyone: isShowAllUsers(user, allUsers),
      allowed,
      filter,
    }),
    typeFilter === "credit" || typeFilter === "debit"
      ? eq(ledgerEntries.type, typeFilter)
      : undefined,
  );
}

/** One page of ledger entries, newest first. */
export async function getLedgersPage(
  params: ListParams & { cursor?: string | null },
) {
  const cursor = decodeCursor(params.cursor);
  const rows = await db
    .select({
      id: ledgerEntries.id,
      personId: ledgerEntries.personId,
      personName: persons.name,
      type: ledgerEntries.type,
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
    .innerJoin(persons, eq(ledgerEntries.personId, persons.id))
    .leftJoin(sites, eq(ledgerEntries.siteId, sites.id))
    .innerJoin(categories, eq(ledgerEntries.categoryId, categories.id))
    .innerJoin(users, eq(ledgerEntries.createdBy, users.id))
    .where(
      and(
        await ledgersWhere(params),
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

/** Count and totals over the whole filtered list (not just the loaded page). */
export async function getLedgersSummary(params: ListParams) {
  const [row] = await db
    .select({ count: countAll, credit: creditSum, debit: debitSum })
    .from(ledgerEntries)
    .where(await ledgersWhere(params));
  return {
    count: row?.count ?? 0,
    credit: row?.credit ?? 0,
    debit: row?.debit ?? 0,
  };
}

/* ------------------------------------------------------------------ */
/* Expenses                                                            */
/* ------------------------------------------------------------------ */

async function expensesWhere({ siteId, allUsers, filter, user }: ListParams) {
  const allowed = await getAllowedSites(user);
  return expenseScope({
    siteId,
    user,
    everyone: isShowAllUsers(user, allUsers),
    allowed,
    filter,
  });
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

export async function getExpensesSummary(params: ListParams) {
  const [row] = await db
    .select({ count: countAll, total: expenseTotal })
    .from(expenses)
    .where(await expensesWhere(params));
  return { count: row?.count ?? 0, total: row?.total ?? 0 };
}

export type { Page };
