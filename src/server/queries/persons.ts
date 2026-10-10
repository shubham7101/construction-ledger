import "server-only";
import { and, asc, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { db } from "@/db";
import {
  categories,
  ledgerBalances,
  ledgerEntries,
  personBalances,
  persons,
  personTypes,
  siteMembership,
  sites,
  users,
} from "@/db/schema";
import type { CurrentUser } from "@/server/auth/jwt";
import { isShowAllUsers } from "@/server/permissions";
import { afterCursor, decodeCursor, PAGE_SIZE, toPage } from "./pagination";
import {
  balanceEntries,
  balancesCover,
  countAll,
  escapeLike,
  getAllowedSites,
  getMirror,
  getOwnPersonId,
  isLedgerFiltered,
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
  viewerType,
} from "./shared";

export async function getPersonsData(params: {
  siteId: number;
  query?: string;
  ptype?: string;
  sort?: string;
  /** Soft-deleted persons are hidden unless asked for. */
  status?: "active" | "inactive" | "all";
  /** "1" = every person, balanced over everyone's entries (admins only). */
  allUsers?: string;
  user: CurrentUser;
}) {
  const {
    siteId,
    query = "",
    ptype = "",
    sort = "az",
    status = "active",
    allUsers,
    user,
  } = params;
  // By default the logged-in user's own entries, admins included: the list
  // shows only persons they have dealt with, and the balance between the two
  // of them. A person linked to a user also counts that user's entries
  // against the viewer's own person, mirrored. With show-all (admins), every
  // person and their overall balance.
  const everyone = isShowAllUsers(user, allUsers);
  const [allowed, ownPersonId] = await Promise.all([
    getAllowedSites(user),
    everyone ? null : getOwnPersonId(user.id),
  ]);
  const scope: ScopeOptions = {
    siteId,
    user,
    everyone,
    allowed,
    mirror:
      ownPersonId === null
        ? undefined
        : { personId: persons.id, counterpartId: persons.userId, ownPersonId },
  };
  // The mirror's condition includes the person; otherwise join on it.
  const balanceOn = scope.mirror
    ? ledgerBalanceScope(scope)
    : and(eq(ledgerBalances.personId, persons.id), ledgerBalanceScope(scope));

  const term = query.trim().toLowerCase();
  const pattern = `%${escapeLike(term)}%`;
  const search = term
    ? or(
        sql`lower(${persons.name}) LIKE ${pattern} ESCAPE '!'`,
        sql`${persons.mobile} LIKE ${pattern} ESCAPE '!'`,
      )
    : undefined;

  // single query: persons LEFT JOIN their scoped ledger_balances rows (one
  // per creator and site), summed per person. Show-all keeps every person,
  // at 0 if none match; otherwise HAVING drops persons with no entries in
  // scope (rows left at zero by deletes count none).
  const rows = await db
    .select({
      id: persons.id,
      name: persons.name,
      mobile: persons.mobile,
      isActive: persons.isActive,
      type: personTypes.name,
      credit: viewerBalanceCredit(scope),
      debit: viewerBalanceDebit(scope),
    })
    .from(persons)
    .innerJoin(personTypes, eq(persons.personTypeId, personTypes.id))
    .leftJoin(ledgerBalances, balanceOn)
    .where(
      and(
        ptype ? eq(personTypes.name, ptype) : undefined,
        status === "all"
          ? undefined
          : eq(persons.isActive, status === "active" ? 1 : 0),
        search,
      ),
    )
    .groupBy(persons.id, personTypes.name)
    .having(everyone ? undefined : gt(balanceEntries, 0));

  const result = rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    mobile: r.mobile,
    active: r.isActive === 1,
    net: r.credit - r.debit,
  }));

  result.sort((a, b) => {
    if (sort === "za") return b.name.localeCompare(a.name);
    if (sort === "high") return b.net - a.net;
    if (sort === "low") return a.net - b.net;
    return a.name.localeCompare(b.name);
  });

  return result;
}

/* ------------------------------------------------------------------ */
/* Passbook                                                            */
/* ------------------------------------------------------------------ */

type PassbookParams = {
  personId: number;
  scope: number; // site id or -1
  allUsers?: string;
  filter?: ParsedFilters;
  user: CurrentUser;
};

async function passbookScope({
  personId,
  scope,
  allUsers,
  filter,
  user,
}: PassbookParams): Promise<ScopeOptions> {
  const everyone = isShowAllUsers(user, allUsers);
  const [allowed, mirror] = await Promise.all([
    getAllowedSites(user),
    isOwnScope(user, everyone, filter)
      ? getMirror(personId, user.id)
      : undefined,
  ]);
  return { siteId: scope, user, everyone, allowed, filter, mirror };
}

/** The person's rows, unless the scope's mirror condition already picks them. */
const ofPerson = (
  column: SQLiteColumn,
  scope: ScopeOptions,
  personId: number,
) => (scope.mirror ? undefined : eq(column, personId));

function passbookWhere(params: PassbookParams, scope: ScopeOptions) {
  return and(
    ofPerson(ledgerEntries.personId, scope, params.personId),
    ledgerScope(scope),
  );
}

/** One page of a person's entries, newest first. */
export async function getPassbookPage(
  params: PassbookParams & { cursor?: string | null },
) {
  const cursor = decodeCursor(params.cursor);
  const scope = await passbookScope(params);
  const rows = await db
    .select({
      id: ledgerEntries.id,
      // A mirrored entry reads from the viewer's side.
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
    .leftJoin(sites, eq(ledgerEntries.siteId, sites.id))
    .innerJoin(categories, eq(ledgerEntries.categoryId, categories.id))
    .innerJoin(users, eq(ledgerEntries.createdBy, users.id))
    .where(
      and(
        passbookWhere(params, scope),
        afterCursor(ledgerEntries.date, ledgerEntries.id, cursor),
      ),
    )
    .orderBy(desc(ledgerEntries.date), desc(ledgerEntries.id))
    .limit(PAGE_SIZE + 1);
  return toPage(rows, (r) => ({ date: r.date, kind: "", id: r.id }));
}

export type PassbookRow = Awaited<
  ReturnType<typeof getPassbookPage>
>["items"][number];

/**
 * Totals and count over every matching entry, read from the balance tables
 * unless a date / category filter needs the entries themselves. "Show all
 * users" across all sites with no filter is every entry of the person: the
 * one person_balances row.
 */
async function passbookTotals(params: PassbookParams) {
  if (
    isShowAllUsers(params.user, params.allUsers) &&
    params.scope < 0 &&
    !isLedgerFiltered(params.filter)
  ) {
    const [row] = await db
      .select({
        credit: personBalances.credit,
        debit: personBalances.debit,
        count: personBalances.entries,
      })
      .from(personBalances)
      .where(eq(personBalances.personId, params.personId))
      .limit(1);
    return row;
  }
  const scope = await passbookScope(params);
  if (balancesCover(params.filter)) {
    const [row] = await db
      .select({
        credit: viewerBalanceCredit(scope),
        debit: viewerBalanceDebit(scope),
        count: balanceEntries,
      })
      .from(ledgerBalances)
      .where(
        and(
          ofPerson(ledgerBalances.personId, scope, params.personId),
          ledgerBalanceScope(scope),
        ),
      );
    return row;
  }
  const [row] = await db
    .select({
      credit: viewerCreditSum(scope),
      debit: viewerDebitSum(scope),
      count: countAll,
    })
    .from(ledgerEntries)
    .where(passbookWhere(params, scope));
  return row;
}

/** The person, totals and count over every matching entry, and the first page. */
export async function getPassbookData(params: PassbookParams) {
  // In parallel: for an unknown person the totals and page are just discarded.
  const [[personRow], totals, entries] = await Promise.all([
    db
      .select({ person: persons, personTypeName: personTypes.name })
      .from(persons)
      .innerJoin(personTypes, eq(persons.personTypeId, personTypes.id))
      .where(eq(persons.id, params.personId))
      .limit(1),
    passbookTotals(params),
    getPassbookPage(params),
  ]);
  if (!personRow) return null;

  const credit = totals?.credit ?? 0;
  const debit = totals?.debit ?? 0;
  const { person } = personRow;

  return {
    person: {
      id: person.id,
      name: person.name,
      type: personRow.personTypeName,
      mobile: person.mobile,
      mobile2: person.mobile2,
      email: person.email,
      address: person.address,
      active: person.isActive === 1,
      userId: person.userId,
    },
    credit,
    debit,
    net: credit - debit,
    count: totals?.count ?? 0,
    entries,
  };
}

/**
 * The sites a person has entries on (from site_membership), plus those of
 * mirrored entries (their user's against the viewer's own person), limited
 * to the sites the viewer may access — the passbook's site tabs.
 */
export async function getPersonSites(
  personId: number,
  user: CurrentUser,
  allUsers?: string,
) {
  const [allowed, mirror] = await Promise.all([
    getAllowedSites(user),
    isShowAllUsers(user, allUsers) ? undefined : getMirror(personId, user.id),
  ]);
  return db
    .select({ id: sites.id, name: sites.name })
    .from(sites)
    .where(
      and(
        or(
          inArray(
            sites.id,
            db
              .select({ id: siteMembership.siteId })
              .from(siteMembership)
              .where(eq(siteMembership.personId, personId)),
          ),
          mirror
            ? inArray(
                sites.id,
                db
                  .select({ id: ledgerBalances.siteId })
                  .from(ledgerBalances)
                  .where(
                    and(
                      eq(ledgerBalances.personId, mirror.ownPersonId),
                      eq(ledgerBalances.userId, mirror.counterpartId),
                      gt(ledgerBalances.entries, 0),
                    ),
                  ),
              )
            : undefined,
        ),
        eq(sites.isActive, 1),
        siteAccessCondition(sites.id, allowed, false),
      ),
    )
    .orderBy(asc(sites.id));
}

/**
 * The passbook's site tabs and the one in view: the requested site when the
 * person has entries there, otherwise -1 (all sites).
 */
export async function getPassbookScope(
  personId: number,
  user: CurrentUser,
  requestedSiteId: number,
  allUsers?: string,
) {
  const sites = await getPersonSites(personId, user, allUsers);
  const scope = sites.some((s) => s.id === requestedSiteId)
    ? requestedSiteId
    : -1;
  return { sites, scope };
}

/** A person's name for a filter chip's label; null when there is none. */
export async function getPersonName(personId: number): Promise<string | null> {
  if (personId < 0) return null;
  const [row] = await db
    .select({ name: persons.name })
    .from(persons)
    .where(eq(persons.id, personId))
    .limit(1);
  return row?.name ?? null;
}
