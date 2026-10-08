import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { categories, persons, personTypes, sites } from "@/db/schema";
import type { CurrentUser } from "@/server/auth/jwt";
import { getAllowedSites } from "./shared";

/*
 * These are wrapped in React's cache() so the layout and the page share one
 * query per request. cache() keys on argument identity, and getCurrentUser
 * is itself memoised, so every caller in a request passes the *same* `user`
 * object. Outside a React render (e.g. route handlers) cache() falls
 * back to a plain call — no memoisation, but also no cross-request leak.
 */

const querySites = cache(async (user: CurrentUser) => {
  const allowedSite = await getAllowedSites(user);
  if (allowedSite !== null && allowedSite.length === 0) return [];

  return db
    .select({ id: sites.id, name: sites.name, city: sites.city })
    .from(sites)
    .where(
      and(
        eq(sites.isActive, 1),
        allowedSite === null ? undefined : inArray(sites.id, allowedSite),
      ),
    )
    .orderBy(asc(sites.name));
});

const queryCategories = cache(() =>
  db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.isActive, 1))
    .orderBy(asc(categories.name)),
);

const queryPersonTypes = cache(() =>
  db
    .select({ id: personTypes.id, name: personTypes.name })
    .from(personTypes)
    .where(eq(personTypes.isActive, 1))
    .orderBy(asc(personTypes.name)),
);

/** Sites only — what the header pill and SitePickerSheet need. */
export const getSitesOptions = cache(async (user: CurrentUser) => ({
  sites: await querySites(user),
}));

/**
 * Sites + categories + person types: the picker's option lists.
 * Deliberately excludes persons — that table grows without bound, so persons
 * are searched on demand instead (see searchPersonsAction).
 */
export const getReferenceOptions = cache(async (user: CurrentUser) => {
  const [siteRows, categoryRows, personTypeRows] = await Promise.all([
    querySites(user),
    queryCategories(),
    queryPersonTypes(),
  ]);
  return {
    sites: siteRows,
    categories: categoryRows,
    personTypes: personTypeRows,
  };
});

/** The person record linked to a user account, for the admin user detail page. */
export async function getLinkedPerson(
  userId: number,
): Promise<{ id: number; name: string; mobile: string } | null> {
  const [row] = await db
    .select({ id: persons.id, name: persons.name, mobile: persons.mobile })
    .from(persons)
    .where(eq(persons.userId, userId))
    .limit(1);
  return row ?? null;
}
