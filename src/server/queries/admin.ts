import "server-only";
import { and, asc, desc, eq, or, type SQL, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { db } from "@/db";
import {
  categories,
  personTypes,
  sites,
  userSiteAccess,
  users,
} from "@/db/schema";
import { countAll, escapeLike } from "./shared";

/* ------------------------------------------------------------------ */
/* Shared list options: status filter, sort, search                    */
/* ------------------------------------------------------------------ */

export type ListStatus = "active" | "inactive" | "all";
export type ListSort = "az" | "za" | "newest" | "oldest";

export interface AdminListParams {
  status: ListStatus;
  sort: string;
  q?: string;
}

/** Soft-deleted rows (is_active = 0) are hidden unless asked for. */
const statusWhere = (column: SQLiteColumn, status: ListStatus) =>
  status === "all" ? undefined : eq(column, status === "active" ? 1 : 0);

/** Name sorts ignore case; newest / oldest follow creation order (id). */
const orderFor = (sort: string, name: SQLiteColumn, id: SQLiteColumn) => {
  if (sort === "za") return desc(sql`lower(${name})`);
  if (sort === "newest") return desc(id);
  if (sort === "oldest") return asc(id);
  return asc(sql`lower(${name})`);
};

/** Case-insensitive substring match on any of the columns. */
const searchWhere = (q: string | undefined, columns: SQLiteColumn[]) => {
  const term = q?.trim().toLowerCase();
  if (!term) return undefined;
  const pattern = `%${escapeLike(term)}%`;
  return or(
    ...columns.map((c): SQL => sql`lower(${c}) LIKE ${pattern} ESCAPE '!'`),
  );
};

const countActive = (column: SQLiteColumn) =>
  sql<number>`COALESCE(SUM(CASE WHEN ${column} = 1 THEN 1 ELSE 0 END), 0)`;

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

/** Never select passwordHash — these rows are passed to client components. */
const userColumns = {
  id: users.id,
  name: users.name,
  mobile: users.mobile,
  role: users.role,
  isActive: users.isActive,
  lastLoginAt: users.lastLoginAt,
};

type UserRow = {
  id: number;
  name: string;
  mobile: string;
  role: string;
  isActive: number;
  lastLoginAt: string | null;
};

const toAdminUser = (u: UserRow, siteAccess: number[]) => ({
  id: u.id,
  name: u.name,
  mobile: u.mobile,
  role: u.role === "admin" ? "Admin" : "Regular",
  active: u.isActive === 1,
  /** UTC "YYYY-MM-DD HH:MM:SS", or null if they never signed in. */
  lastLoginAt: u.lastLoginAt,
  siteAccess,
});

export type AdminUser = ReturnType<typeof toAdminUser>;

export async function getAdminUsersData(
  params: AdminListParams,
): Promise<AdminUser[]> {
  const [rows, allAccess] = await Promise.all([
    db
      .select(userColumns)
      .from(users)
      .where(
        and(
          statusWhere(users.isActive, params.status),
          searchWhere(params.q, [users.name, users.mobile]),
        ),
      )
      .orderBy(orderFor(params.sort, users.name, users.id)),
    db.select().from(userSiteAccess),
  ]);

  const accessByUser = new Map<number, number[]>();
  for (const { userId, siteId } of allAccess) {
    const list = accessByUser.get(userId);
    if (list) list.push(siteId);
    else accessByUser.set(userId, [siteId]);
  }

  return rows.map((u) => toAdminUser(u, accessByUser.get(u.id) ?? []));
}

/** One user plus their site access, for the admin user detail page. */
export async function getAdminUser(id: number): Promise<AdminUser | null> {
  const [[user], access] = await Promise.all([
    db.select(userColumns).from(users).where(eq(users.id, id)).limit(1),
    db
      .select({ siteId: userSiteAccess.siteId })
      .from(userSiteAccess)
      .where(eq(userSiteAccess.userId, id)),
  ]);
  return user
    ? toAdminUser(
        user,
        access.map((a) => a.siteId),
      )
    : null;
}

/* ------------------------------------------------------------------ */
/* Sites                                                               */
/* ------------------------------------------------------------------ */

export async function getAdminSitesList(params: AdminListParams) {
  const rows = await db
    .select({
      id: sites.id,
      name: sites.name,
      address: sites.address,
      city: sites.city,
      state: sites.state,
      status: sites.status,
      isActive: sites.isActive,
    })
    .from(sites)
    .where(
      and(
        statusWhere(sites.isActive, params.status),
        searchWhere(params.q, [sites.name, sites.city]),
      ),
    )
    .orderBy(orderFor(params.sort, sites.name, sites.id));
  return rows.map(({ isActive, ...s }) => ({ ...s, active: isActive === 1 }));
}

export type AdminSite = Awaited<ReturnType<typeof getAdminSitesList>>[number];

/* ------------------------------------------------------------------ */
/* Categories master (categories + person types)                       */
/* ------------------------------------------------------------------ */

export type MasterKind = "categories" | "personTypes";

/** Categories and person types share one shape and one admin screen. */
export async function getAdminMasterList(
  kind: MasterKind,
  params: AdminListParams,
) {
  const table = kind === "categories" ? categories : personTypes;
  const rows = await db
    .select({ id: table.id, name: table.name, isActive: table.isActive })
    .from(table)
    .where(
      and(
        statusWhere(table.isActive, params.status),
        searchWhere(params.q, [table.name]),
      ),
    )
    .orderBy(orderFor(params.sort, table.name, table.id));
  return rows.map(({ isActive, ...r }) => ({ ...r, active: isActive === 1 }));
}

export type MasterItem = Awaited<ReturnType<typeof getAdminMasterList>>[number];

/* ------------------------------------------------------------------ */
/* Hub                                                                 */
/* ------------------------------------------------------------------ */

/** Just the numbers the admin hub cards show. */
export async function getAdminHubCounts() {
  const [[u], [s], [c], [p]] = await Promise.all([
    db
      .select({ total: countAll, active: countActive(users.isActive) })
      .from(users),
    db
      .select({ total: countAll, active: countActive(sites.isActive) })
      .from(sites),
    db.select({ active: countActive(categories.isActive) }).from(categories),
    db.select({ active: countActive(personTypes.isActive) }).from(personTypes),
  ]);

  return {
    users: u?.total ?? 0,
    activeUsers: u?.active ?? 0,
    sites: s?.total ?? 0,
    activeSites: s?.active ?? 0,
    activeCategories: c?.active ?? 0,
    activePersonTypes: p?.active ?? 0,
  };
}
