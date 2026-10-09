import "server-only";
import {
  and,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { cache } from "react";
import {
  expenseBalances,
  expenses,
  ledgerBalances,
  ledgerEntries,
} from "@/db/schema";
import type { CurrentUser } from "@/server/auth/jwt";
import { NO_SITE } from "@/server/balances";
import { getAllowedSiteIds } from "@/server/permissions";

export interface ParsedFilters {
  t?: string;
  dm: "any" | "day" | "range";
  d1?: string; // YYYY-MM-DD
  d2?: string; // YYYY-MM-DD
  /** Only entries / expenses in this category (-1 or absent = any). */
  categoryId?: number;
  /** Only this person's ledger entries (-1 or absent = anyone). */
  personId?: number;
}

const has = (id: number | undefined): id is number =>
  id !== undefined && id >= 0;

export const creditSum = sql<number>`COALESCE(SUM(CASE WHEN ${ledgerEntries.type} = 'credit' THEN ${ledgerEntries.amount} ELSE 0 END), 0)`;
export const debitSum = sql<number>`COALESCE(SUM(CASE WHEN ${ledgerEntries.type} = 'debit' THEN ${ledgerEntries.amount} ELSE 0 END), 0)`;
export const countAll = sql<number>`COUNT(*)`;
export const expenseTotal = sql<number>`COALESCE(SUM(${expenses.amount}), 0)`;

function buildDateConditions(
  dateCol: SQLiteColumn,
  filter?: ParsedFilters,
): SQL | undefined {
  if (!filter || filter.dm === "any") return undefined;
  if (filter.dm === "day" && filter.d1) return eq(dateCol, filter.d1);
  if (filter.dm === "range") {
    if (filter.d1 && filter.d2)
      return and(gte(dateCol, filter.d1), lte(dateCol, filter.d2));
    if (filter.d1) return gte(dateCol, filter.d1);
    if (filter.d2) return lte(dateCol, filter.d2);
  }
  return undefined;
}

/**
 * `null` = unrestricted (admin). An empty array = a user with no site access.
 * Memoised per request (see reference.ts) so the layout and page share one lookup.
 */
export const getAllowedSites = cache(
  (user: CurrentUser): Promise<number[] | null> => getAllowedSiteIds(user),
);

/**
 * Restrict a site column to the sites the user may access.
 * With no access at all, site-bound rows are excluded (never "unrestricted").
 */
export function siteAccessCondition(
  column: SQLiteColumn,
  allowed: number[] | null,
  includeNull: boolean,
): SQL | undefined {
  if (allowed === null) return undefined;
  const inList = allowed.length > 0 ? inArray(column, allowed) : undefined;
  if (includeNull) return inList ? or(inList, isNull(column)) : isNull(column);
  return inList ?? sql`0`;
}

export interface ScopeOptions {
  siteId: number;
  user: CurrentUser;
  everyone: boolean;
  allowed: number[] | null;
  filter?: ParsedFilters;
}

export function ledgerScope({
  siteId,
  user,
  everyone,
  allowed,
  filter,
}: ScopeOptions) {
  return and(
    siteId >= 0 ? eq(ledgerEntries.siteId, siteId) : undefined,
    everyone ? undefined : eq(ledgerEntries.createdBy, user.id),
    siteAccessCondition(ledgerEntries.siteId, allowed, true),
    buildDateConditions(ledgerEntries.date, filter),
    has(filter?.categoryId)
      ? eq(ledgerEntries.categoryId, filter.categoryId)
      : undefined,
    has(filter?.personId)
      ? eq(ledgerEntries.personId, filter.personId)
      : undefined,
  );
}

/** True when the filter narrows ledger rows (date, category or person). */
export function isLedgerFiltered(filter?: ParsedFilters): boolean {
  return (
    buildDateConditions(ledgerEntries.date, filter) !== undefined ||
    has(filter?.categoryId) ||
    has(filter?.personId)
  );
}

export function expenseScope({
  siteId,
  user,
  everyone,
  allowed,
  filter,
}: ScopeOptions) {
  return and(
    siteId >= 0 ? eq(expenses.siteId, siteId) : undefined,
    everyone ? undefined : eq(expenses.createdBy, user.id),
    siteAccessCondition(expenses.siteId, allowed, false),
    buildDateConditions(expenses.date, filter),
    has(filter?.categoryId)
      ? eq(expenses.categoryId, filter.categoryId)
      : undefined,
    // Expenses aren't tied to a person: a person filter matches none.
    has(filter?.personId) ? sql`0` : undefined,
  );
}

/* ------------------------------------------------------------------ */
/* Balance tables                                                      */
/* ------------------------------------------------------------------ */

// Sums over ledger_balances / expense_balances rows.
export const balanceCredit = sql<number>`COALESCE(SUM(${ledgerBalances.credit}), 0)`;
export const balanceDebit = sql<number>`COALESCE(SUM(${ledgerBalances.debit}), 0)`;
export const balanceEntries = sql<number>`COALESCE(SUM(${ledgerBalances.entries}), 0)`;
export const balanceExpense = sql<number>`COALESCE(SUM(${expenseBalances.total}), 0)`;
export const balanceExpenses = sql<number>`COALESCE(SUM(${expenseBalances.count}), 0)`;

/**
 * The balance tables hold totals per creator, person and site, so they can
 * stand in for any scope except a date or category filter.
 */
export const balancesCover = (filter?: ParsedFilters) =>
  buildDateConditions(ledgerEntries.date, filter) === undefined &&
  !has(filter?.categoryId);

/**
 * The ledger_balances rows whose sums equal ledgerScope(opts) totals. Only
 * valid when balancesCover(opts.filter).
 */
export function ledgerBalanceScope({
  siteId,
  user,
  everyone,
  allowed,
  filter,
}: ScopeOptions) {
  return and(
    siteId >= 0 ? eq(ledgerBalances.siteId, siteId) : undefined,
    everyone ? undefined : eq(ledgerBalances.userId, user.id),
    // As siteAccessCondition with "No site" included; it is stored as 0.
    allowed === null
      ? undefined
      : inArray(ledgerBalances.siteId, [...allowed, NO_SITE]),
    has(filter?.personId)
      ? eq(ledgerBalances.personId, filter.personId)
      : undefined,
  );
}

/** As ledgerBalanceScope, for expenseScope(opts) and expense_balances. */
export function expenseBalanceScope({
  siteId,
  user,
  everyone,
  allowed,
  filter,
}: ScopeOptions) {
  return and(
    siteId >= 0 ? eq(expenseBalances.siteId, siteId) : undefined,
    everyone ? undefined : eq(expenseBalances.userId, user.id),
    siteAccessCondition(expenseBalances.siteId, allowed, false),
    has(filter?.personId) ? sql`0` : undefined,
  );
}

/** Escape LIKE wildcards; paired with `ESCAPE '!'` in the query. */
export const escapeLike = (value: string) => value.replace(/[!%_]/g, "!$&");
