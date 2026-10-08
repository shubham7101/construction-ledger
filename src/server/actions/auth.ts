"use server";

import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { loginSchema } from "@/lib/validators";
import { createJwtToken, destroyJwtToken } from "@/server/auth/jwt";
import { verifyPassword } from "@/server/auth/password";
import { type ActionResult, runAction } from "./shared";

const INVALID_CREDENTIALS = "Invalid mobile number or password";

export async function loginAction(formData: unknown): Promise<ActionResult> {
  return runAction("Login failed", async () => {
    const data = loginSchema.parse(formData);

    const [user] = await db
      .select({
        id: users.id,
        isActive: users.isActive,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.mobile, data.mobile))
      .limit(1);

    if (!user) return { ok: false, error: INVALID_CREDENTIALS };
    if (user.isActive === 0) {
      return { ok: false, error: "Account is disabled. Please contact admin." };
    }
    if (!(await verifyPassword(data.password, user.passwordHash))) {
      return { ok: false, error: INVALID_CREDENTIALS };
    }

    // Signs the JWT and stores it in an httpOnly session cookie; the
    // browser attaches it to every subsequent request automatically.
    await createJwtToken(user.id);
    await db
      .update(users)
      .set({ lastLoginAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(users.id, user.id));
    return { ok: true };
  });
}

export async function logoutAction(): Promise<ActionResult> {
  return runAction("Logout failed", async () => {
    await destroyJwtToken();
    return { ok: true };
  });
}
