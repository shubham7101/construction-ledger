import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { persons, sites, userSiteAccess } from "@/db/schema";
import { type CurrentUser, loadedSiteIds } from "./auth/jwt";

export async function getUserAllowedSiteIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({ siteId: userSiteAccess.siteId })
    .from(userSiteAccess)
    .where(eq(userSiteAccess.userId, userId));

  return rows.map((r) => r.siteId);
}

/**
 * `null` = unrestricted (admin). Uses the ids loaded with the user when
 * available, so it normally costs no query.
 */
export async function getAllowedSiteIds(
  user: CurrentUser,
): Promise<number[] | null> {
  if (user.role === "admin") return null;
  return loadedSiteIds(user) ?? getUserAllowedSiteIds(user.id);
}

export async function canAccessSite(
  user: CurrentUser,
  siteId: number | null,
): Promise<boolean> {
  // null site is allowed for user's own entries
  if (siteId === null) return true;
  // Admin has implicit access to all sites
  const allowedSites = await getAllowedSiteIds(user);
  return allowedSites === null || allowedSites.includes(siteId);
}

export function canEditOrDeleteRecord(
  user: CurrentUser,
  createdByUserId: number,
): boolean {
  if (user.role === "admin") return true;
  return createdByUserId === user.id;
}

export function isShowAllUsers(
  user: CurrentUser,
  allParam?: string | number | boolean,
): boolean {
  if (user.role !== "admin") return false;
  return String(allParam) === "1" || String(allParam) === "true";
}

/** Inactive (soft-deleted) sites take no new entries. `null` = "No site". */
export async function isSiteActive(siteId: number | null): Promise<boolean> {
  if (siteId === null) return true;
  const [row] = await db
    .select({ isActive: sites.isActive })
    .from(sites)
    .where(eq(sites.id, siteId))
    .limit(1);
  return row?.isActive === 1;
}

/**
 * What a ledger write needs to know about its person: inactive (soft-deleted)
 * persons take no new entries, and a user's own linked person takes none from
 * that user. `null` = no such person.
 */
export async function getPersonForEntry(
  personId: number,
): Promise<{ active: boolean; userId: number | null } | null> {
  const [row] = await db
    .select({ isActive: persons.isActive, userId: persons.userId })
    .from(persons)
    .where(eq(persons.id, personId))
    .limit(1);
  return row ? { active: row.isActive === 1, userId: row.userId } : null;
}
