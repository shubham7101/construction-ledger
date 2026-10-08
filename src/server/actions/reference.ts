"use server";

import "server-only";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { persons } from "@/db/schema";
import { requireUser } from "@/server/auth/jwt";
import { getReferenceOptions } from "@/server/queries/reference";

/** One page of results — persons grow without bound, so never load them all. */
const SEARCH_LIMIT = 30;
const TERM_LIMIT = 50;

export interface PersonOption {
  id: number;
  name: string;
  mobile: string;
}

export interface ReferenceOptions {
  sites: Array<{ id: number; name: string; city: string }>;
  categories: Array<{ id: number; name: string }>;
  personTypes: Array<{ id: number; name: string }>;
}

/**
 * Search persons by name or mobile for the picker. Case-insensitive
 * substring match, capped at 30 rows; an empty query returns the first 30
 * by name so the sheet has options on first open.
 *
 * Names and companies are user data — never log the query or the rows.
 */
export async function searchPersonsAction(
  query: string,
  limit: number = SEARCH_LIMIT,
): Promise<PersonOption[]> {
  await requireUser();

  const term = query.trim().toLowerCase().slice(0, TERM_LIMIT);
  // Escape LIKE wildcards; paired with `ESCAPE '!'` below.
  const pattern = `%${term.replace(/[!%_]/g, "!$&")}%`;

  return db
    .select({ id: persons.id, name: persons.name, mobile: persons.mobile })
    .from(persons)
    .where(
      and(
        eq(persons.isActive, 1), // inactive persons can't take new entries
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
