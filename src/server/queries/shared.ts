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
  /**
   * Admins: only entries / expenses logged by this user (-1 or absent = the
   * viewer's own, or everyone's with show-all). Ignored for other users.
   */
  createdBy?: number;
  /** Only ledger entries paid this way. Expenses have no mode: none match. */
  mode?: "cash" | "upi" | "bank_transfer" | "cheque";
  /** Amount range in whole rupees, inclusive; either end optional. */
  minAmount?: number;
  maxAmount?: number;
}

const has = (id: number | undefined): id is number =>
  id !== undefined && id >= 0;

export const creditSum = sql<number>`COALESCE(SUM(CASE WHEN ${ledgerEntries.type} = 'credit' THEN ${ledgerEntries.amount} ELSE 0 END), 0)`;
export const debitSum = sql<number>`COALESCE(SUM(CASE WHEN ${ledgerEntries.type} = 'debit' THEN ${ledgerEntries.amount} ELSE 0 END), 0)`;
export const countAll = sql<number>`COUNT(*)`;
export const expenseTotal = sql<number>`COALESCE(SUM(${expenses.amount}), 0)`;

/** The amount-range filter on an amount column. */
function amountConditions(
  column: SQLiteColumn,
  filter?: ParsedFilters,
): SQL | undefined {
  return and(
    filter?.minAmount !== undefined ? gte(column, filter.minAmount) : undefined,
    filter?.maxAmount !== undefined ? lte(column, filter.maxAmount) : undefined,
  );
}

const hasAmountRange = (filter?: ParsedFilters) =>
  filter?.minAmount !== undefined || filter?.maxAmount !== undefined;

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

/**
 * Whose rows are in scope: one picked user ("logged by", admins only), else
 * everyone's with show-all, else the viewer's own.
 */
function creatorCondition(
  column: SQLiteColumn,
  { user, everyone, filter }: ScopeOptions,
): SQL | undefined {
  if (user.role === "admin" && has(filter?.createdBy)) {
    return eq(column, filter.createdBy);
  }
  return everyone ? undefined : eq(column, user.id);
}

export interface ScopeOptions {
  siteId: number;
  user: CurrentUser;
  everyone: boolean;
  allowed: number[] | null;
  filter?: ParsedFilters;
}

export function ledgerScope(opts: ScopeOptions) {
  const { siteId, allowed, filter } = opts;
  return and(
    siteId >= 0 ? eq(ledgerEntries.siteId, siteId) : undefined,
    creatorCondition(ledgerEntries.createdBy, opts),
    siteAccessCondition(ledgerEntries.siteId, allowed, true),
    buildDateConditions(ledgerEntries.date, filter),
    has(filter?.categoryId)
      ? eq(ledgerEntries.categoryId, filter.categoryId)
      : undefined,
    has(filter?.personId)
      ? eq(ledgerEntries.personId, filter.personId)
      : undefined,
    filter?.mode ? eq(ledgerEntries.mode, filter.mode) : undefined,
    amountConditions(ledgerEntries.amount, filter),
  );
}

/** True when the filter narrows ledger rows (date, category, person, creator, mode or amount). */
export function isLedgerFiltered(filter?: ParsedFilters): boolean {
  return (
    buildDateConditions(ledgerEntries.date, filter) !== undefined ||
    has(filter?.categoryId) ||
    has(filter?.personId) ||
    has(filter?.createdBy) ||
    Boolean(filter?.mode) ||
    hasAmountRange(filter)
  );
}

export function expenseScope(opts: ScopeOptions) {
  const { siteId, allowed, filter } = opts;
  return and(
    siteId >= 0 ? eq(expenses.siteId, siteId) : undefined,
    creatorCondition(expenses.createdBy, opts),
    siteAccessCondition(expenses.siteId, allowed, false),
    buildDateConditions(expenses.date, filter),
    has(filter?.categoryId)
      ? eq(expenses.categoryId, filter.categoryId)
      : undefined,
    // Expenses aren't tied to a person or a payment mode: those match none.
    has(filter?.personId) || filter?.mode ? sql`0` : undefined,
    amountConditions(expenses.amount, filter),
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
 * stand in for any scope except a date, category, payment-mode or amount
 * filter.
 */
export const balancesCover = (filter?: ParsedFilters) =>
  buildDateConditions(ledgerEntries.date, filter) === undefined &&
  !has(filter?.categoryId) &&
  !filter?.mode &&
  !hasAmountRange(filter);

/**
 * The ledger_balances rows whose sums equal ledgerScope(opts) totals. Only
 * valid when balancesCover(opts.filter).
 */
export function ledgerBalanceScope(opts: ScopeOptions) {
  const { siteId, allowed, filter } = opts;
  return and(
    siteId >= 0 ? eq(ledgerBalances.siteId, siteId) : undefined,
    creatorCondition(ledgerBalances.userId, opts),
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
export function expenseBalanceScope(opts: ScopeOptions) {
  const { siteId, allowed, filter } = opts;
  return and(
    siteId >= 0 ? eq(expenseBalances.siteId, siteId) : undefined,
    creatorCondition(expenseBalances.userId, opts),
    siteAccessCondition(expenseBalances.siteId, allowed, false),
    has(filter?.personId) ? sql`0` : undefined,
  );
}

/** Escape LIKE wildcards; paired with `ESCAPE '!'` in the query. */
export const escapeLike = (value: string) => value.replace(/[!%_]/g, "!$&");
