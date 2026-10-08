import "server-only";
import { eq } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { env } from "@/server/env";

export const JWT_COOKIE_NAME = "cl_token";
const JWT_DURATION_SECONDS = 7 * 24 * 60 * 60; // 7 days
const JWT_ALGORITHM = "HS256";

const SECRET_KEY = new TextEncoder().encode(env.JWT_SECRET);

export interface CurrentUser {
  id: number;
  name: string;
  mobile: string;
  role: "admin" | "regular";
}

/**
 * Signs a JWT for an already-authenticated user (verify the password first)
 * and stores it in an `httpOnly` session cookie.
 *
 * The token carries only the user id (standard `sub` claim). Name, mobile
 * and role are always read fresh from the database, so changes (deactivation,
 * role change) take effect immediately.
 *
 * `secure` follows the request protocol (`x-forwarded-proto`) instead of
 * NODE_ENV, so the cookie also works over plain HTTP on the LAN; behind an
 * HTTPS terminator it is automatically marked Secure.
 */
export async function createJwtToken(userId: number): Promise<void> {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${JWT_DURATION_SECONDS}s`)
    .sign(SECRET_KEY);

  const headerStore = await headers();
  const isSecure = headerStore.get("x-forwarded-proto") === "https";

  const cookieStore = await cookies();
  cookieStore.set(JWT_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax",
    path: "/",
    maxAge: JWT_DURATION_SECONDS,
  });
}

/** Removes the session cookie (used on logout). */
export async function destroyJwtToken(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(JWT_COOKIE_NAME);
}

/**
 * The source of truth for "is this person logged in": verifies the token AND
 * checks the user still exists and is active. Returns null (never throws or
 * redirects), so it is safe to call from the /login page.
 *
 * Wrapped in React's cache() so several calls in one request hit the
 * database once.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(JWT_COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, SECRET_KEY, {
      algorithms: [JWT_ALGORITHM],
    });
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0) return null;

    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        mobile: users.mobile,
        role: users.role,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || user.isActive === 0) return null;

    return {
      id: user.id,
      name: user.name,
      mobile: user.mobile,
      role: user.role,
    };
  } catch {
    return null;
  }
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}
