"use server";

import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { persons, users } from "@/db/schema";
import { changePasswordSchema, profileSchema } from "@/lib/validators";
import { requireUser } from "@/server/auth/jwt";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { type ActionResult, revalidateAllPages, runAction } from "./shared";

/** The signed-in user edits their own name and mobile (their login number). */
export async function updateMyProfileAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("Failed to update profile", async () => {
    const user = await requireUser();
    const data = profileSchema.parse(input);

    const [clash] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.mobile, data.mobile), ne(users.id, user.id)))
      .limit(1);
    if (clash) {
      return {
        ok: false,
        error: "Another user already has this mobile number",
      };
    }

    // Keep the linked person record in step with the account.
    await db.batch([
      db
        .update(users)
        .set({ name: data.name, mobile: data.mobile })
        .where(eq(users.id, user.id)),
      db
        .update(persons)
        .set({ name: data.name, mobile: data.mobile })
        .where(eq(persons.userId, user.id)),
    ]);

    revalidateAllPages(); // the name shows in the header everywhere
    return { ok: true };
  });
}

export async function changeMyPasswordAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("Failed to change password", async () => {
    const user = await requireUser();
    const { current, next } = changePasswordSchema.parse(input);

    const [row] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    if (!row || !(await verifyPassword(current, row.passwordHash))) {
      return { ok: false, error: "Current password is incorrect" };
    }

    await db
      .update(users)
      .set({ passwordHash: await hashPassword(next) })
      .where(eq(users.id, user.id));
    return { ok: true };
  });
}
