import "server-only";
import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categories,
  ledgerEntries,
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
  countAll,
  creditSum,
  debitSum,
  escapeLike,
  getAllowedSites,
  ledgerScope,
  type ParsedFilters,
  siteAccessCondition,
} from "./shared";

export async function getPersonsData(params: {
  siteId: number;
  query?: string;
  ptype?: string;
  sort?: string;
  /** Soft-deleted persons are hidden unless asked for. */
  status?: "active" | "inactive" | "all";
  user: CurrentUser;
}) {
  const {
    siteId,
    query = "",
    ptype = "",
    sort = "az",
    status = "active",
    user,
  } = params;
  const allowed = await getAllowedSites(user);
  // Always the logged-in user's own entries, admins included: the list shows
  // only persons they have dealt with, and the balance between the two of them.
  const ledgerOn = ledgerScope({
    siteId,
    user,
    everyone: false,
    allowed,
  });

  const term = query.trim().toLowerCase();
  const pattern = `%${escapeLike(term)}%`;
  const search = term
    ? or(
        sql`lower(${persons.name}) LIKE ${pattern} ESCAPE '!'`,
        sql`${persons.mobile} LIKE ${pattern} ESCAPE '!'`,
      )
    : undefined;

  // single query: persons INNER JOIN their scoped ledger rows, aggregated per
  // person — the inner join drops persons with no entries by this user
  const rows = await db
    .select({
      id: persons.id,
      name: persons.name,
      mobile: persons.mobile,
      isActive: persons.isActive,
      type: personTypes.name,
      credit: creditSum,
      debit: debitSum,
      entries: sql<number>`COUNT(${ledgerEntries.id})`,
    })
    .from(persons)
    .innerJoin(personTypes, eq(persons.personTypeId, personTypes.id))
    .innerJoin(
      ledgerEntries,
      and(eq(ledgerEntries.personId, persons.id), ledgerOn),
    )
    .where(
      and(
        ptype ? eq(personTypes.name, ptype) : undefined,
        status === "all"
          ? undefined
          : eq(persons.isActive, status === "active" ? 1 : 0),
        search,
      ),
    )
    .groupBy(persons.id, personTypes.name);

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

async function passbookWhere({
  personId,
  scope,
  allUsers,
  filter,
  user,
}: PassbookParams) {
  const allowed = await getAllowedSites(user);
  return and(
    eq(ledgerEntries.personId, personId),
    ledgerScope({
      siteId: scope,
      user,
      everyone: isShowAllUsers(user, allUsers),
      allowed,
      filter,
    }),
  );
}

/** One page of a person's entries, newest first. */
export async function getPassbookPage(
  params: PassbookParams & { cursor?: string | null },
) {
  const cursor = decodeCursor(params.cursor);
  const rows = await db
    .select({
      id: ledgerEntries.id,
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
    .leftJoin(sites, eq(ledgerEntries.siteId, sites.id))
    .innerJoin(categories, eq(ledgerEntries.categoryId, categories.id))
    .innerJoin(users, eq(ledgerEntries.createdBy, users.id))
    .where(
      and(
        await passbookWhere(params),
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

/** The person, totals and count over every matching entry, and the first page. */
export async function getPassbookData(params: PassbookParams) {
  // In parallel: for an unknown person the totals and page are just discarded.
  const [[personRow], [totals], entries] = await Promise.all([
    db
      .select({ person: persons, personTypeName: personTypes.name })
      .from(persons)
      .innerJoin(personTypes, eq(persons.personTypeId, personTypes.id))
      .where(eq(persons.id, params.personId))
      .limit(1),
    db
      .select({ credit: creditSum, debit: debitSum, count: countAll })
      .from(ledgerEntries)
      .where(await passbookWhere(params)),
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
 * The sites a person has entries on (from site_membership), limited to the
 * sites the viewer may access — the passbook's site tabs.
 */
export async function getPersonSites(personId: number, user: CurrentUser) {
  const allowed = await getAllowedSites(user);
  return db
    .select({ id: sites.id, name: sites.name })
    .from(siteMembership)
    .innerJoin(sites, eq(siteMembership.siteId, sites.id))
    .where(
      and(
        eq(siteMembership.personId, personId),
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
) {
  const sites = await getPersonSites(personId, user);
  const scope = sites.some((s) => s.id === requestedSiteId)
    ? requestedSiteId
    : -1;
  return { sites, scope };
}
