"use server";

import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { persons, personTypes, users } from "@/db/schema";
import { personSchema } from "@/lib/validators";
import { requireAdmin, requireUser } from "@/server/auth/jwt";
import { type ActionResult, revalidatePaths, runAction } from "./shared";

export async function createPersonAction(
  input: unknown,
): Promise<ActionResult<{ id: number }>> {
  return runAction("Failed to create person", async () => {
    await requireUser();
    // The schema normalises mobile to exactly 10 digits, the same form the
    // users table enforces, so an indexed equality lookup finds the account.
    const data = personSchema.parse(input);

    // Link to the account with this mobile only if it has no person yet —
    // users get their own person on creation, and persons.user_id is unique.
    const [linkedUser] = await db
      .select({ id: users.id })
      .from(users)
      .leftJoin(persons, eq(persons.userId, users.id))
      .where(and(eq(users.mobile, data.mobile), isNull(persons.id)))
      .limit(1);

    const [inserted] = await db
      .insert(persons)
      .values({ ...data, userId: linkedUser?.id ?? null })
      .returning({ id: persons.id });

    revalidatePaths("/persons");
    return { ok: true, data: { id: inserted.id } };
  });
}

export interface PersonDetail {
  id: number;
  name: string;
  mobile: string;
  mobile2: string;
  email: string;
  address: string;
  personTypeId: number;
  personType: string;
  active: boolean;
  /** Linked to a user account: its mobile is that user's login. */
  linkedUserId: number | null;
}

/** One person's editable fields, for the edit form. */
export async function getPersonAction(
  id: number,
): Promise<PersonDetail | null> {
  await requireUser();
  const [row] = await db
    .select({
      id: persons.id,
      name: persons.name,
      mobile: persons.mobile,
      mobile2: persons.mobile2,
      email: persons.email,
      address: persons.address,
      personTypeId: persons.personTypeId,
      personType: personTypes.name,
      isActive: persons.isActive,
      linkedUserId: persons.userId,
    })
    .from(persons)
    .innerJoin(personTypes, eq(persons.personTypeId, personTypes.id))
    .where(eq(persons.id, id))
    .limit(1);
  if (!row) return null;
  const { isActive, ...rest } = row;
  return { ...rest, active: isActive === 1 };
}

export async function updatePersonAction(
  id: number,
  input: unknown,
): Promise<ActionResult> {
  return runAction("Failed to update person", async () => {
    await requireUser();
    const data = personSchema.parse(input);

    const [existing] = await db
      .select({ mobile: persons.mobile, userId: persons.userId })
      .from(persons)
      .where(eq(persons.id, id))
      .limit(1);
    if (!existing) return { ok: false, error: "Person not found" };

    // A linked person's mobile is that user's login number.
    if (existing.userId !== null && data.mobile !== existing.mobile) {
      return {
        ok: false,
        error:
          "This person is linked to a user account — change the mobile from Admin → Users",
      };
    }

    // One atomic request instead of an interactive transaction.
    await db.batch([
      db.update(persons).set(data).where(eq(persons.id, id)),
      // Keep the account's display name in step with its person record.
      ...(existing.userId !== null
        ? [
            db
              .update(users)
              .set({ name: data.name })
              .where(eq(users.id, existing.userId)),
          ]
        : []),
    ]);

    revalidatePaths("/persons", `/persons/${id}`);
    return { ok: true };
  });
}

/** Soft delete (admins): the person leaves lists and pickers; entries stay. */
export async function setPersonActiveAction(
  id: number,
  active: boolean,
): Promise<ActionResult> {
  return runAction("Failed to update person", async () => {
    await requireAdmin();
    await db
      .update(persons)
      .set({ isActive: active ? 1 : 0 })
      .where(eq(persons.id, id));
    revalidatePaths("/persons", `/persons/${id}`);
    return { ok: true };
  });
}
