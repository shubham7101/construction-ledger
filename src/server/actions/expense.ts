"use server";

import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, expenses, sites, users } from "@/db/schema";
import { expenseSchema } from "@/lib/validators";
import { requireUser } from "@/server/auth/jwt";
import {
  canAccessSite,
  canEditOrDeleteRecord,
  isSiteActive,
} from "@/server/permissions";
import {
  type ActionResult,
  rethrowIfRedirect,
  revalidateExpensePages,
  runAction,
  SITE_ACCESS_DENIED,
  SITE_INACTIVE,
} from "./shared";

export interface ExpenseDetail {
  id: number;
  amount: number;
  date: string;
  siteId: number;
  siteName: string;
  categoryId: number;
  category: string;
  note: string;
  recordedBy: string;
  /** Admins and the expense's creator may edit or delete it. */
  canEdit: boolean;
}

async function findCreator(id: number) {
  const [row] = await db
    .select({ createdBy: expenses.createdBy, siteId: expenses.siteId })
    .from(expenses)
    .where(eq(expenses.id, id))
    .limit(1);
  return row;
}

export async function createExpenseAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("Failed to create expense", async () => {
    const user = await requireUser();
    const data = expenseSchema.parse(input);

    if (!(await canAccessSite(user, data.siteId))) {
      return { ok: false, error: SITE_ACCESS_DENIED };
    }
    if (!(await isSiteActive(data.siteId))) {
      return { ok: false, error: SITE_INACTIVE };
    }

    await db.insert(expenses).values({ ...data, createdBy: user.id });

    revalidateExpensePages();
    return { ok: true };
  });
}

export async function updateExpenseAction(
  id: number,
  input: unknown,
): Promise<ActionResult> {
  return runAction("Failed to update expense", async () => {
    const user = await requireUser();
    const data = expenseSchema.parse(input);

    const existing = await findCreator(id);
    if (!existing) return { ok: false, error: "Expense not found" };
    if (!canEditOrDeleteRecord(user, existing.createdBy)) {
      return { ok: false, error: "Unauthorized to edit this expense" };
    }
    if (!(await canAccessSite(user, data.siteId))) {
      return { ok: false, error: SITE_ACCESS_DENIED };
    }
    // Moving to another site needs that site to be active; staying put is fine.
    if (data.siteId !== existing.siteId && !(await isSiteActive(data.siteId))) {
      return { ok: false, error: SITE_INACTIVE };
    }

    await db
      .update(expenses)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(expenses.id, id));

    revalidateExpensePages();
    return { ok: true };
  });
}

export async function deleteExpenseAction(id: number): Promise<ActionResult> {
  return runAction("Failed to delete expense", async () => {
    const user = await requireUser();

    const existing = await findCreator(id);
    if (!existing) return { ok: false, error: "Expense not found" };
    if (!canEditOrDeleteRecord(user, existing.createdBy)) {
      return { ok: false, error: "Unauthorized to delete this expense" };
    }

    await db.delete(expenses).where(eq(expenses.id, id));

    revalidateExpensePages();
    return { ok: true };
  });
}

/** One row on demand for the detail sheet, instead of loading every expense up front. */
export async function getExpenseAction(
  id: number,
): Promise<ExpenseDetail | null> {
  try {
    const user = await requireUser();

    const [row] = await db
      .select({
        id: expenses.id,
        amount: expenses.amount,
        date: expenses.date,
        siteId: expenses.siteId,
        siteName: sites.name,
        categoryId: expenses.categoryId,
        category: categories.name,
        note: expenses.note,
        recordedBy: users.name,
        createdBy: expenses.createdBy,
      })
      .from(expenses)
      .innerJoin(sites, eq(expenses.siteId, sites.id))
      .innerJoin(categories, eq(expenses.categoryId, categories.id))
      .innerJoin(users, eq(expenses.createdBy, users.id))
      .where(eq(expenses.id, id))
      .limit(1);

    if (!row) return null;
    if (!(await canAccessSite(user, row.siteId))) return null;
    const { createdBy, ...detail } = row;
    return { ...detail, canEdit: canEditOrDeleteRecord(user, createdBy) };
  } catch (err: unknown) {
    rethrowIfRedirect(err);
    return null;
  }
}
