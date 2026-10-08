"use server";

import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { db, type Tx } from "@/db";
import {
  categories,
  persons,
  personTypes,
  sites,
  userSiteAccess,
  users,
} from "@/db/schema";
import { normalizeName } from "@/lib/normalize";
import {
  categorySchema,
  createUserSchema,
  personTypeSchema,
  siteSchema,
  updateUserSchema,
} from "@/lib/validators";
import { requireAdmin } from "@/server/auth/jwt";
import { hashPassword } from "@/server/auth/password";
import {
  type ActionResult,
  revalidateAllPages,
  revalidatePaths,
  runAction,
} from "./shared";

/** Person type given to the person record auto-created for every new user. */
const USER_PERSON_TYPE = normalizeName("Contractor");

/** Case-insensitive name match, so "cement" and "Cement" count as the same. */
const sameName = (column: SQLiteColumn, name: string) =>
  sql`lower(${column}) = lower(${name})`;

/** Seeded by db:seed, but created on demand so user creation never depends on it. */
async function getOrCreatePersonTypeId(tx: Tx, name: string): Promise<number> {
  const [existing] = await tx
    .select({ id: personTypes.id })
    .from(personTypes)
    .where(sameName(personTypes.name, name))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await tx
    .insert(personTypes)
    .values({ name })
    .returning({ id: personTypes.id });
  return created.id;
}

/** Friendly duplicate check (ignoring case) before the unique index would fire. */
async function nameTaken(
  table: typeof categories | typeof personTypes,
  name: string,
  exceptId?: number,
): Promise<boolean> {
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(
      and(
        sameName(table.name, name),
        exceptId === undefined ? undefined : ne(table.id, exceptId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

const duplicate = (noun: string, name: string) => ({
  ok: false as const,
  error: `A ${noun} named "${name}" already exists`,
});

const SELF_LOCKOUT = "You can't deactivate or demote your own admin account";

export async function createSiteAction(input: unknown): Promise<ActionResult> {
  return runAction("Failed to create site", async () => {
    await requireAdmin();
    const data = siteSchema.parse(input);
    // Stored exactly as entered — no generated code or name prefix.
    await db.insert(sites).values(data);
    revalidateAllPages();
    return { ok: true };
  });
}

export async function updateSiteAction(
  id: number,
  input: unknown,
): Promise<ActionResult> {
  return runAction("Failed to update site", async () => {
    await requireAdmin();
    const data = siteSchema.parse(input);
    await db.update(sites).set(data).where(eq(sites.id, id));
    revalidateAllPages();
    return { ok: true };
  });
}

/** Soft delete: inactive sites leave the pickers; their entries are kept. */
export async function setSiteActiveAction(
  id: number,
  active: boolean,
): Promise<ActionResult> {
  return runAction("Failed to update site", async () => {
    await requireAdmin();
    await db
      .update(sites)
      .set({ isActive: active ? 1 : 0 })
      .where(eq(sites.id, id));
    revalidateAllPages();
    return { ok: true };
  });
}

export async function createCategoryAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("Failed to create category", async () => {
    await requireAdmin();
    const { name } = categorySchema.parse(input);
    if (await nameTaken(categories, name)) return duplicate("category", name);
    await db.insert(categories).values({ name });
    revalidateAllPages();
    return { ok: true };
  });
}

export async function updateCategoryAction(
  id: number,
  input: unknown,
): Promise<ActionResult> {
  return runAction("Failed to update category", async () => {
    await requireAdmin();
    const { name } = categorySchema.parse(input);
    if (await nameTaken(categories, name, id)) {
      return duplicate("category", name);
    }
    await db.update(categories).set({ name }).where(eq(categories.id, id));
    revalidateAllPages();
    return { ok: true };
  });
}

/** Soft delete: entries keep their category; it just leaves the pickers. */
export async function setCategoryActiveAction(
  id: number,
  active: boolean,
): Promise<ActionResult> {
  return runAction("Failed to update category", async () => {
    await requireAdmin();
    await db
      .update(categories)
      .set({ isActive: active ? 1 : 0 })
      .where(eq(categories.id, id));
    revalidateAllPages();
    return { ok: true };
  });
}

export async function createPersonTypeAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("Failed to create person type", async () => {
    await requireAdmin();
    const { name } = personTypeSchema.parse(input);
    if (await nameTaken(personTypes, name)) {
      return duplicate("person type", name);
    }
    await db.insert(personTypes).values({ name });
    revalidateAllPages();
    return { ok: true };
  });
}

export async function updatePersonTypeAction(
  id: number,
  input: unknown,
): Promise<ActionResult> {
  return runAction("Failed to update person type", async () => {
    await requireAdmin();
    const { name } = personTypeSchema.parse(input);
    if (await nameTaken(personTypes, name, id)) {
      return duplicate("person type", name);
    }
    await db.update(personTypes).set({ name }).where(eq(personTypes.id, id));
    revalidateAllPages();
    return { ok: true };
  });
}

/** Soft delete: persons keep their type; it just leaves the pickers. */
export async function setPersonTypeActiveAction(
  id: number,
  active: boolean,
): Promise<ActionResult> {
  return runAction("Failed to update person type", async () => {
    await requireAdmin();
    await db
      .update(personTypes)
      .set({ isActive: active ? 1 : 0 })
      .where(eq(personTypes.id, id));
    revalidateAllPages();
    return { ok: true };
  });
}

export async function createUserAction(
  input: unknown,
): Promise<ActionResult<{ id: number }>> {
  return runAction("Failed to create user", async () => {
    await requireAdmin();
    // The schema normalises mobile to exactly 10 digits (stored without prefix).
    const data = createUserSchema.parse(input);

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.mobile, data.mobile))
      .limit(1);
    if (existing) {
      return {
        ok: false,
        error: "A user with this mobile number already exists",
      };
    }

    // Hash outside the transaction so the write lock isn't held during bcrypt.
    const passwordHash = await hashPassword(data.password);

    // The user and their person record are created together or not at all.
    const userId = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          name: data.name,
          mobile: data.mobile,
          passwordHash,
          role: data.role,
          isActive: 1,
        })
        .returning({ id: users.id });

      await tx.insert(persons).values({
        name: data.name,
        mobile: data.mobile,
        personTypeId: await getOrCreatePersonTypeId(tx, USER_PERSON_TYPE),
        userId: user.id,
      });

      return user.id;
    });

    revalidatePaths("/admin/users", "/admin", "/persons");
    return { ok: true, data: { id: userId } };
  });
}

export async function updateUserAction(
  id: number,
  input: unknown,
): Promise<ActionResult> {
  return runAction("Failed to update user", async () => {
    const admin = await requireAdmin();
    const data = updateUserSchema.parse(input);
    if (id === admin.id && data.role !== "admin") {
      return { ok: false, error: SELF_LOCKOUT };
    }

    const [clash] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.mobile, data.mobile), ne(users.id, id)))
      .limit(1);
    if (clash) {
      return {
        ok: false,
        error: "A user with this mobile number already exists",
      };
    }

    const passwordHash = data.password
      ? await hashPassword(data.password)
      : undefined;

    // The user and their linked person record change together.
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          name: data.name,
          mobile: data.mobile,
          role: data.role,
          ...(passwordHash ? { passwordHash } : {}),
        })
        .where(eq(users.id, id));
      await tx
        .update(persons)
        .set({ name: data.name, mobile: data.mobile })
        .where(eq(persons.userId, id));
    });

    revalidatePaths("/admin", "/admin/users", `/admin/users/${id}`, "/persons");
    return { ok: true };
  });
}

/** Soft delete: an inactive user can no longer sign in; their entries stay. */
export async function setUserActiveAction(
  userId: number,
  active: boolean,
): Promise<ActionResult> {
  return runAction("Failed to update user active status", async () => {
    const admin = await requireAdmin();
    if (userId === admin.id && !active) {
      return { ok: false, error: SELF_LOCKOUT };
    }
    await db
      .update(users)
      .set({ isActive: active ? 1 : 0 })
      .where(eq(users.id, userId));
    revalidatePaths("/admin", "/admin/users", `/admin/users/${userId}`);
    return { ok: true };
  });
}

export async function setUserSiteAccessAction(
  userId: number,
  siteId: number,
  granted: boolean,
): Promise<ActionResult> {
  return runAction("Failed to update site access", async () => {
    await requireAdmin();

    if (granted) {
      await db
        .insert(userSiteAccess)
        .values({ userId, siteId })
        .onConflictDoNothing();
    } else {
      await db
        .delete(userSiteAccess)
        .where(
          and(
            eq(userSiteAccess.userId, userId),
            eq(userSiteAccess.siteId, siteId),
          ),
        );
    }

    revalidatePaths("/admin/users", `/admin/users/${userId}`);
    return { ok: true };
  });
}
