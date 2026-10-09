"use server";

import "server-only";
import { and, asc, eq, isNull, ne, or, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { persons, users } from "@/db/schema";
import { requireAdmin, requireUser } from "@/server/auth/jwt";
import { getReferenceOptions } from "@/server/queries/reference";

/** One page of results — persons grow without bound, so never load them all. */
const SEARCH_LIMIT = 30;
const TERM_LIMIT = 50;

export interface PersonOption {
  id: number;
  name: string;
  mobile: string;
}

export interface UserOption {
  id: number;
  name: string;
  active: boolean;
}

export interface ReferenceOptions {
  sites: Array<{ id: number; name: string; city: string }>;
  categories: Array<{ id: number; name: string }>;
  personTypes: Array<{ id: number; name: string }>;
}

/**
 * Persons whose name or mobile contains `query` (case-insensitive), first 30
 * by name; an empty query returns the first 30 so a sheet has options on
 * first open. `where` narrows it further.
 *
 * Names and companies are user data — never log the query or the rows.
 */
function searchPersons(query: string, limit: number, where?: SQL) {
  const term = query.trim().toLowerCase().slice(0, TERM_LIMIT);
  // Escape LIKE wildcards; paired with `ESCAPE '!'` below.
  const pattern = `%${term.replace(/[!%_]/g, "!$&")}%`;

  return db
    .select({ id: persons.id, name: persons.name, mobile: persons.mobile })
    .from(persons)
    .where(
      and(
        where,
        term
          ? or(
              sql`lower(${persons.name}) LIKE ${pattern} ESCAPE '!'`,
              sql`${persons.mobile} LIKE ${pattern} ESCAPE '!'`,
            )
          : undefined,
      ),
    )
    .orderBy(asc(persons.name))
    .limit(Math.min(Math.max(Math.trunc(limit) || 1, 1), SEARCH_LIMIT));
}

/**
 * Persons a new ledger entry can be for. Inactive persons take no new
 * entries, and the user's own linked person is left out: nobody records an
 * entry with themselves.
 */
export async function searchPersonsAction(
  query: string,
  limit: number = SEARCH_LIMIT,
): Promise<PersonOption[]> {
  const user = await requireUser();
  return searchPersons(
    query,
    limit,
    and(
      eq(persons.isActive, 1),
      or(isNull(persons.userId), ne(persons.userId, user.id)),
    ),
  );
}

/**
 * Persons to filter a list by: every person, inactive ones and the user's
 * own included, since existing entries can involve any of them.
 */
export async function searchPersonsToFilterAction(
  query: string,
): Promise<PersonOption[]> {
  await requireUser();
  return searchPersons(query, SEARCH_LIMIT);
}

/** One person's picker label, for forms opened with a person preselected. */
export async function getPersonOptionAction(
  id: number,
): Promise<PersonOption | null> {
  await requireUser();
  const [row] = await db
    .select({ id: persons.id, name: persons.name, mobile: persons.mobile })
    .from(persons)
    .where(eq(persons.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * The picker's small option lists (sites, categories, person types),
 * fetched when the picker first opens instead of on every page load.
 */
export async function getReferenceOptionsAction(): Promise<ReferenceOptions> {
  const user = await requireUser();
  const { sites, categories, personTypes } = await getReferenceOptions(user);
  return { sites, categories, personTypes };
}

/**
 * Every other user, for the admins' "Logged by" picker. Deactivated users
 * are included: their entries stay.
 */
export async function getUserOptionsAction(): Promise<UserOption[]> {
  const admin = await requireAdmin();
  const rows = await db
    .select({ id: users.id, name: users.name, isActive: users.isActive })
    .from(users)
    .where(ne(users.id, admin.id))
    .orderBy(asc(users.name));
  return rows.map(({ isActive, ...r }) => ({ ...r, active: isActive === 1 }));
}
