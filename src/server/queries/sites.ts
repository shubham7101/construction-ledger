import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  expenses,
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
  countAll,
  creditSum,
  debitSum,
  expenseScope,
  expenseTotal,
  getAllowedSites,
  ledgerScope,
  type ParsedFilters,
  type ScopeOptions,
  siteAccessCondition,
} from "./shared";

type FeedParams = {
  siteId: number;
  allUsers?: string;
  filter?: ParsedFilters;
  user: CurrentUser;
};

async function feedScope({ siteId, allUsers, filter, user }: FeedParams) {
  const allowed = await getAllowedSites(user);
  const scope: ScopeOptions = {
    siteId,
    user,
    everyone: isShowAllUsers(user, allUsers),
    allowed,
    filter,
  };
  const feedType = filter?.t;
  return {
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
  const { ledgerWhere, expenseWhere, includeLedger, includeExpenses } =
    await feedScope(params);

  const [ledgerRows, expenseRows] = await Promise.all([
    includeLedger
      ? db
          .select({
            id: ledgerEntries.id,
            personId: ledgerEntries.personId,
            personName: persons.name,
            type: ledgerEntries.type,
            amount: ledgerEntries.amount,
            date: ledgerEntries.date,
            siteName: sites.name,
            category: categories.name,
            createdBy: users.name,
          })
          .from(ledgerEntries)
          .innerJoin(persons, eq(ledgerEntries.personId, persons.id))
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

/** Active sites this user can access — the Sites tab list. */
export async function getSitesList(user: CurrentUser) {
  const allowed = await getAllowedSites(user);
  return db
    .select(siteSummaryColumns)
    .from(sites)
    .where(
      and(eq(sites.isActive, 1), siteAccessCondition(sites.id, allowed, false)),
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
  const site = await getAccessibleSite(params.siteId, params.user);
  if (!site) return null;

  const { ledgerWhere, expenseWhere, includeLedger, includeExpenses } =
    await feedScope(params);

  const [[ledgerRes], [expenseRes], feed] = await Promise.all([
    db
      .select({ credit: creditSum, debit: debitSum, count: countAll })
      .from(ledgerEntries)
      .where(ledgerWhere),
    db
      .select({ total: expenseTotal, count: countAll })
      .from(expenses)
      .where(expenseWhere),
    getFeedPage(params),
  ]);

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
 */
export async function getSitePersons(params: FeedParams) {
  const { siteId, allUsers, filter, user } = params;
  const allowed = await getAllowedSites(user);
  const ledgerOn = ledgerScope({
    siteId,
    user,
    everyone: isShowAllUsers(user, allUsers),
    allowed,
    // dates apply; category / person filters are for the feed, not the roll-up
    filter: filter && { dm: filter.dm, d1: filter.d1, d2: filter.d2 },
  });

  const rows = await db
    .select({
      id: persons.id,
      name: persons.name,
      credit: creditSum,
      debit: debitSum,
    })
    .from(siteMembership)
    .innerJoin(persons, eq(siteMembership.personId, persons.id))
    .leftJoin(
      ledgerEntries,
      and(eq(ledgerEntries.personId, persons.id), ledgerOn),
    )
    .where(eq(siteMembership.siteId, siteId))
    .groupBy(persons.id)
    .orderBy(asc(sql`lower(${persons.name})`));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    net: r.credit - r.debit,
  }));
}
