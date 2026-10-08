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
import { expenses, ledgerEntries } from "@/db/schema";
import type { CurrentUser } from "@/server/auth/jwt";
import { getUserAllowedSiteIds } from "@/server/permissions";

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
  async (user: CurrentUser): Promise<number[] | null> =>
    user.role === "admin" ? null : getUserAllowedSiteIds(user.id),
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

/** Escape LIKE wildcards; paired with `ESCAPE '!'` in the query. */
export const escapeLike = (value: string) => value.replace(/[!%_]/g, "!$&");
