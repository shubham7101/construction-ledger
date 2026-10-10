import "server-only";
import { and, asc, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { db } from "@/db";
import {
  categories,
  expenseBalances,
  expenses,
  ledgerBalances,
  ledgerEntries,
  persons,
  siteMembership,
  sites,
  users,
} from "@/db/schema";
import type { CurrentUser } from "@/server/auth/jwt";
import { isShowAllUsers } from "@/server/permissions";
import { afterFeedCursor, decodeCursor, PAGE_SIZE, toPage } from "./pagination";
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
  getOwnPersonId,
  isOwnScope,
  ledgerBalanceScope,
  ledgerScope,
  type ParsedFilters,
  type ScopeOptions,
  siteAccessCondition,
  viewerBalanceCredit,
  viewerBalanceDebit,
  viewerCreditSum,
  viewerDebitSum,
  viewerPersonId,
  viewerType,
} from "./shared";

type FeedParams = {
  siteId: number;
  allUsers?: string;
  filter?: ParsedFilters;
  user: CurrentUser;
};

async function feedScope({ siteId, allUsers, filter, user }: FeedParams) {
  const everyone = isShowAllUsers(user, allUsers);
  // Entries other users log against the viewer's own person are theirs too.
  const [allowed, mirror] = await Promise.all([
    getAllowedSites(user),
    getListMirror(user, everyone, filter),
  ]);
  const scope: ScopeOptions = {
    siteId,
    user,
    everyone,
    allowed,
    filter,
    mirror,
  };
  const feedType = filter?.t;
  return {
    scope,
    ledgerWhere: ledgerScope(scope),
    expenseWhere: expenseScope(scope),
    includeLedger: feedType !== "Expenses Only",
    includeExpenses: feedType !== "Ledgers Only",
  };
}

/**
 * One page of the mixed ledger + expense feed, newest first — for one site,
 * or all the user's sites when `siteId` is -1. Each side is paged on the
 * same (date, kind, id) order, then the two are merged. Queries are always
 * limited to the user's sites; a person filter shows ledger entries only.
 */
export async function getFeedPage(
  params: FeedParams & { cursor?: string | null },
) {
  const cursor = decodeCursor(params.cursor);
  const { scope, ledgerWhere, expenseWhere, includeLedger, includeExpenses } =
    await feedScope(params);
  // A mirrored entry reads from the viewer's side.
  const personId = viewerPersonId(scope);

  const [ledgerRows, expenseRows] = await Promise.all([
    includeLedger
      ? db
          .select({
            id: ledgerEntries.id,
            personId,
            personName: persons.name,
            type: viewerType(scope),
            amount: ledgerEntries.amount,
            date: ledgerEntries.date,
            siteName: sites.name,
            category: categories.name,
            createdBy: users.name,
          })
          .from(ledgerEntries)
          .innerJoin(persons, eq(persons.id, personId))
          .leftJoin(sites, eq(ledgerEntries.siteId, sites.id))
          .innerJoin(categories, eq(ledgerEntries.categoryId, categories.id))
          .innerJoin(users, eq(ledgerEntries.createdBy, users.id))
          .where(
            and(
              ledgerWhere,
              afterFeedCursor(
                ledgerEntries.date,
                "L",
                ledgerEntries.id,
                cursor,
              ),
            ),
          )
          .orderBy(desc(ledgerEntries.date), desc(ledgerEntries.id))
          .limit(PAGE_SIZE + 1)
      : [],
    includeExpenses
      ? db
          .select({
            id: expenses.id,
            note: expenses.note,
            amount: expenses.amount,
            date: expenses.date,
            siteName: sites.name,
            category: categories.name,
            createdBy: users.name,
          })
          .from(expenses)
          .innerJoin(sites, eq(expenses.siteId, sites.id))
          .innerJoin(categories, eq(expenses.categoryId, categories.id))
          .innerJoin(users, eq(expenses.createdBy, users.id))
          .where(
            and(
              expenseWhere,
              afterFeedCursor(expenses.date, "E", expenses.id, cursor),
            ),
          )
          .orderBy(desc(expenses.date), desc(expenses.id))
          .limit(PAGE_SIZE + 1)
      : [],
  ]);

  // Same order as the cursor: date, then kind ("L" before "E"), then id.
  // Dates are YYYY-MM-DD, so string comparison is chronological.
  const merged = [
    ...ledgerRows.map((x) => ({ ...x, k: "L" as const })),
    ...expenseRows.map((x) => ({ ...x, k: "E" as const })),
  ].sort(
    (a, b) =>
      b.date.localeCompare(a.date) || b.k.localeCompare(a.k) || b.id - a.id,
  );

  return toPage(merged, (r) => ({ date: r.date, kind: r.k, id: r.id }));
}

export type FeedItem = Awaited<ReturnType<typeof getFeedPage>>["items"][number];

const siteSummaryColumns = {
  id: sites.id,
  name: sites.name,
  address: sites.address,
  city: sites.city,
  state: sites.state,
  status: sites.status,
};

/**
 * Active sites this user can access — the Sites tab list — optionally
 * narrowed by a search over name / city / state / address and by stage.
 */
export async function getSitesList(
  user: CurrentUser,
  {
    query = "",
    stage,
  }: { query?: string; stage?: "active" | "completed" | "on_hold" } = {},
) {
  const allowed = await getAllowedSites(user);
  const term = query.trim().toLowerCase().slice(0, 50);
  const pattern = `%${escapeLike(term)}%`;
  return db
    .select(siteSummaryColumns)
    .from(sites)
    .where(
      and(
        eq(sites.isActive, 1),
        siteAccessCondition(sites.id, allowed, false),
        stage ? eq(sites.status, stage) : undefined,
        term
          ? or(
              ...[sites.name, sites.city, sites.state, sites.address].map(
                (col) => sql`lower(${col}) LIKE ${pattern} ESCAPE '!'`,
              ),
            )
          : undefined,
      ),
    )
    .orderBy(asc(sites.name));
}

/** One site, only if it is active and this user may access it. */
export async function getAccessibleSite(siteId: number, user: CurrentUser) {
  if (!Number.isInteger(siteId) || siteId < 0) return null;
  const allowed = await getAllowedSites(user);
  const [row] = await db
    .select(siteSummaryColumns)
    .from(sites)
    .where(
      and(
        eq(sites.id, siteId),
        eq(sites.isActive, 1),
        siteAccessCondition(sites.id, allowed, false),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * A site's details page: credit and debit totals and the first feed page.
 * Totals cover the user's own entries, or everyone's with "show all users"
 * (admins only). Expenses are money going out, so they count as debit.
 * Returns null when the site is inactive or not accessible.
 */
export async function getSiteDetail(params: FeedParams) {
  const { scope, ledgerWhere, expenseWhere, includeLedger, includeExpenses } =
    await feedScope(params);
  // From the balance tables unless a date / category filter needs the rows.
  const fromBalances = balancesCover(params.filter);

  // In parallel: for an inaccessible site the totals and feed are discarded.
  const [site, [ledgerRes], [expenseRes], feed] = await Promise.all([
    getAccessibleSite(params.siteId, params.user),
    fromBalances
      ? db
          .select({
            credit: viewerBalanceCredit(scope),
            debit: viewerBalanceDebit(scope),
            count: balanceEntries,
          })
          .from(ledgerBalances)
          .where(ledgerBalanceScope(scope))
      : db
          .select({
            credit: viewerCreditSum(scope),
            debit: viewerDebitSum(scope),
            count: countAll,
          })
          .from(ledgerEntries)
          .where(ledgerWhere),
    fromBalances
      ? db
          .select({ total: balanceExpense, count: balanceExpenses })
          .from(expenseBalances)
          .where(expenseBalanceScope(scope))
      : db
          .select({ total: expenseTotal, count: countAll })
          .from(expenses)
          .where(expenseWhere),
    getFeedPage(params),
  ]);
  if (!site) return null;

  const expenseSum = expenseRes?.total ?? 0;
  return {
    site,
    // Totals ignore the feed-type filter (Ledgers / Expenses only).
    credit: ledgerRes?.credit ?? 0,
    debit: (ledgerRes?.debit ?? 0) + expenseSum,
    expenses: expenseSum,
    count:
      (includeLedger ? (ledgerRes?.count ?? 0) : 0) +
      (includeExpenses ? (expenseRes?.count ?? 0) : 0),
    feed,
  };
}

/**
 * The persons with entries on a site (site_membership), each with their net
 * balance there — over the user's own entries, or everyone's with show-all.
 * Own entries include mirrored ones: a user who logged entries against the
 * viewer's own person there is listed as their person.
 */
export async function getSitePersons(params: FeedParams) {
  const { siteId, allUsers, filter, user } = params;
  // dates and "logged by" apply; category / person filters are for the
  // feed, not the roll-up
  const rollUp = filter && {
    dm: filter.dm,
    d1: filter.d1,
    d2: filter.d2,
    createdBy: filter.createdBy,
  };
  const everyone = isShowAllUsers(user, allUsers);
  const [allowed, ownPersonId] = await Promise.all([
    getAllowedSites(user),
    isOwnScope(user, everyone, rollUp) ? getOwnPersonId(user.id) : null,
  ]);
  const scope: ScopeOptions = {
    siteId,
    user,
    everyone,
    allowed,
    filter: rollUp,
    mirror:
      ownPersonId === null
        ? undefined
        : { personId: persons.id, counterpartId: persons.userId, ownPersonId },
  };
  // The mirror's condition includes the person; otherwise join on it.
  const ofPerson = (column: SQLiteColumn) =>
    scope.mirror ? undefined : eq(column, persons.id);
  const onSite = or(
    inArray(
      persons.id,
      db
        .select({ id: siteMembership.personId })
        .from(siteMembership)
        .where(eq(siteMembership.siteId, siteId)),
    ),
    ownPersonId === null
      ? undefined
      : inArray(
          persons.userId,
          db
            .select({ id: ledgerBalances.userId })
            .from(ledgerBalances)
            .where(
              and(
                eq(ledgerBalances.personId, ownPersonId),
                eq(ledgerBalances.siteId, siteId),
                gt(ledgerBalances.entries, 0),
              ),
            ),
        ),
  );

  // From ledger_balances unless a date filter needs the entries themselves.
  const rows = await (balancesCover(scope.filter)
    ? db
        .select({
          id: persons.id,
          name: persons.name,
          credit: viewerBalanceCredit(scope),
          debit: viewerBalanceDebit(scope),
        })
        .from(persons)
        .leftJoin(
          ledgerBalances,
          and(ofPerson(ledgerBalances.personId), ledgerBalanceScope(scope)),
        )
    : db
        .select({
          id: persons.id,
          name: persons.name,
          credit: viewerCreditSum(scope),
          debit: viewerDebitSum(scope),
        })
        .from(persons)
        .leftJoin(
          ledgerEntries,
          and(ofPerson(ledgerEntries.personId), ledgerScope(scope)),
        )
  )
    .where(onSite)
    .groupBy(persons.id)
    .orderBy(asc(sql`lower(${persons.name})`));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    net: r.credit - r.debit,
  }));
}
