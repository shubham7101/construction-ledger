import "server-only";
import {
  and,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { cache } from "react";
import { db } from "@/db";
import {
  expenseBalances,
  expenses,
  ledgerBalances,
  ledgerEntries,
  persons,
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

/** An entry's type as the viewer sees it: swapped on a mirrored entry. */
export const viewerType = ({ mirror, user }: ScopeOptions) =>
  mirror
    ? sql<
        "credit" | "debit"
      >`CASE WHEN ${ledgerEntries.createdBy} = ${user.id} THEN ${ledgerEntries.type} WHEN ${ledgerEntries.type} = 'credit' THEN 'debit' ELSE 'credit' END`
    : sql<"credit" | "debit">`${ledgerEntries.type}`;

/** As creditSum / debitSum, by the type the viewer sees. */
export const viewerCreditSum = (opts: ScopeOptions) =>
  opts.mirror
    ? sql<number>`COALESCE(SUM(CASE WHEN ${viewerType(opts)} = 'credit' THEN ${ledgerEntries.amount} ELSE 0 END), 0)`
    : creditSum;
export const viewerDebitSum = (opts: ScopeOptions) =>
  opts.mirror
    ? sql<number>`COALESCE(SUM(CASE WHEN ${viewerType(opts)} = 'debit' THEN ${ledgerEntries.amount} ELSE 0 END), 0)`
    : debitSum;
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

/** True when the scope is the viewer's own rows: the only one mirrored. */
export const isOwnScope = (
  user: CurrentUser,
  everyone: boolean,
  filter?: ParsedFilters,
) => !everyone && !(user.role === "admin" && has(filter?.createdBy));

/**
 * The viewer's dealings with a person linked to a user are both sides of one
 * ledger: the viewer's entries against that person, and that user's entries
 * against the viewer's own person with credit and debit swapped, shown under
 * that user's person.
 */
export type Mirror =
  | {
      /** The person in view, or the column of each listed person. */
      personId: number | SQLiteColumn;
      /** The user linked to that person, or the column of each one's. */
      counterpartId: number | SQLiteColumn;
      /** The viewer's own (linked) person. */
      ownPersonId: number;
    }
  | {
      /** Every person: the viewer's rows and all mirrored ones. */
      personId?: undefined;
      counterpartId?: undefined;
      ownPersonId: number;
    };

/** Users who have a linked person: whose entries can be mirrored. */
const linkedUserIds = () =>
  db
    .select({ id: persons.userId })
    .from(persons)
    .where(isNotNull(persons.userId));

/** The person linked to this user's account, if there is one. */
export const getOwnPersonId = cache(
  async (userId: number): Promise<number | null> => {
    const [row] = await db
      .select({ id: persons.id })
      .from(persons)
      .where(eq(persons.userId, userId))
      .limit(1);
    return row?.id ?? null;
  },
);

/**
 * The mirror for the viewer's dealings with one person: none unless the
 * person is linked to another user and the viewer has a person of their own.
 */
export const getMirror = cache(
  async (
    personId: number,
    userId: number,
  ): Promise<
    { personId: number; counterpartId: number; ownPersonId: number } | undefined
  > => {
    const rows = await db
      .select({ id: persons.id, userId: persons.userId })
      .from(persons)
      .where(or(eq(persons.id, personId), eq(persons.userId, userId)));
    const counterpartId = rows.find((r) => r.id === personId)?.userId;
    const ownPersonId = rows.find((r) => r.userId === userId)?.id;
    if (!counterpartId || counterpartId === userId || !ownPersonId) {
      return undefined;
    }
    return { personId, counterpartId, ownPersonId };
  },
);

/**
 * The mirror for a list of the viewer's own rows (ledgers, feed, totals):
 * every person, or one person when the filter picks one. None outside
 * isOwnScope() or without a person of the viewer's own.
 */
export async function getListMirror(
  user: CurrentUser,
  everyone: boolean,
  filter?: ParsedFilters,
): Promise<Mirror | undefined> {
  if (!isOwnScope(user, everyone, filter)) return undefined;
  if (has(filter?.personId)) return getMirror(filter.personId, user.id);
  const ownPersonId = await getOwnPersonId(user.id);
  return ownPersonId === null ? undefined : { ownPersonId };
}

/** The viewer's rows, plus the mirrored ones (see Mirror). */
function mirrorCondition(
  personCol: SQLiteColumn,
  creatorCol: SQLiteColumn,
  user: CurrentUser,
  mirror: Mirror,
): SQL | undefined {
  if (mirror.personId === undefined) {
    return or(
      eq(creatorCol, user.id),
      and(
        eq(personCol, mirror.ownPersonId),
        ne(creatorCol, user.id),
        inArray(creatorCol, linkedUserIds()),
      ),
    );
  }
  return or(
    and(eq(personCol, mirror.personId), eq(creatorCol, user.id)),
    and(
      eq(personCol, mirror.ownPersonId),
      eq(creatorCol, mirror.counterpartId),
    ),
  );
}

/** A filter's person, unless the mirror already picks it (both sides). */
const personFilter = (
  column: SQLiteColumn,
  { filter, mirror }: ScopeOptions,
) =>
  has(filter?.personId) && mirror?.personId === undefined
    ? eq(column, filter.personId)
    : undefined;

/**
 * The person an entry is shown under: its own, or on a mirrored entry the
 * creator's person.
 */
export const viewerPersonId = ({ mirror, user }: ScopeOptions) =>
  mirror
    ? sql<number>`CASE WHEN ${ledgerEntries.createdBy} = ${user.id} THEN ${ledgerEntries.personId} ELSE (SELECT "cp"."id" FROM ${persons} AS "cp" WHERE "cp"."user_id" = ${ledgerEntries.createdBy}) END`
    : sql<number>`${ledgerEntries.personId}`;

export interface ScopeOptions {
  siteId: number;
  user: CurrentUser;
  everyone: boolean;
  allowed: number[] | null;
  filter?: ParsedFilters;
  /**
   * The viewer's dealings with this person, both sides. Replaces the creator
   * condition and includes the person; only with isOwnScope().
   */
  mirror?: Mirror;
}

export function ledgerScope(opts: ScopeOptions) {
  const { siteId, allowed, filter, user, mirror } = opts;
  return and(
    siteId >= 0 ? eq(ledgerEntries.siteId, siteId) : undefined,
    mirror
      ? mirrorCondition(
          ledgerEntries.personId,
          ledgerEntries.createdBy,
          user,
          mirror,
        )
      : creatorCondition(ledgerEntries.createdBy, opts),
    siteAccessCondition(ledgerEntries.siteId, allowed, true),
    buildDateConditions(ledgerEntries.date, filter),
    has(filter?.categoryId)
      ? eq(ledgerEntries.categoryId, filter.categoryId)
      : undefined,
    personFilter(ledgerEntries.personId, opts),
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

/** As balanceCredit / balanceDebit, swapped on mirrored rows (another creator's). */
export const viewerBalanceCredit = (opts: ScopeOptions) =>
  opts.mirror
    ? sql<number>`COALESCE(SUM(CASE WHEN ${ledgerBalances.userId} = ${opts.user.id} THEN ${ledgerBalances.credit} ELSE ${ledgerBalances.debit} END), 0)`
    : balanceCredit;
export const viewerBalanceDebit = (opts: ScopeOptions) =>
  opts.mirror
    ? sql<number>`COALESCE(SUM(CASE WHEN ${ledgerBalances.userId} = ${opts.user.id} THEN ${ledgerBalances.debit} ELSE ${ledgerBalances.credit} END), 0)`
    : balanceDebit;

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
  const { siteId, allowed, user, mirror } = opts;
  return and(
    siteId >= 0 ? eq(ledgerBalances.siteId, siteId) : undefined,
    mirror
      ? mirrorCondition(
          ledgerBalances.personId,
          ledgerBalances.userId,
          user,
          mirror,
        )
      : creatorCondition(ledgerBalances.userId, opts),
    // As siteAccessCondition with "No site" included; it is stored as 0.
    allowed === null
      ? undefined
      : inArray(ledgerBalances.siteId, [...allowed, NO_SITE]),
    personFilter(ledgerBalances.personId, opts),
  );
}

/**
 * Only the mirrored ledger_balances rows: other users' totals against the
 * viewer's own person, on sites the viewer may access. Their credit is the
 * viewer's debit and the other way round.
 */
export function mirroredBalanceScope(
  user: CurrentUser,
  ownPersonId: number,
  allowed: number[] | null,
) {
  return and(
    eq(ledgerBalances.personId, ownPersonId),
    ne(ledgerBalances.userId, user.id),
    inArray(ledgerBalances.userId, linkedUserIds()),
    allowed === null
      ? undefined
      : inArray(ledgerBalances.siteId, [...allowed, NO_SITE]),
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
