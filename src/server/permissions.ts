import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { persons, sites, userSiteAccess } from "@/db/schema";
import type { CurrentUser } from "./auth/jwt";

export async function getUserAllowedSiteIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({ siteId: userSiteAccess.siteId })
    .from(userSiteAccess)
    .where(eq(userSiteAccess.userId, userId));

  return rows.map((r) => r.siteId);
}

export async function canAccessSite(
  user: CurrentUser,
  siteId: number | null,
): Promise<boolean> {
  // null site is allowed for user's own entries
  if (siteId === null) return true;
  // Admin has implicit access to all sites
  if (user.role === "admin") return true;

  const allowedSites = await getUserAllowedSiteIds(user.id);
  return allowedSites.includes(siteId);
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

/** Inactive (soft-deleted) persons take no new entries. */
export async function isPersonActive(personId: number): Promise<boolean> {
  const [row] = await db
    .select({ isActive: persons.isActive })
    .from(persons)
    .where(eq(persons.id, personId))
    .limit(1);
  return row?.isActive === 1;
}
