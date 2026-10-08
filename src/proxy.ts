import { jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const rawJwtSecret = process.env.JWT_SECRET;
if (!rawJwtSecret || rawJwtSecret.length < 32) {
  throw new Error(
    "JWT_SECRET environment variable is required and must be at least 32 characters long according to cryptographic standards.",
  );
}
const JWT_SECRET = new TextEncoder().encode(rawJwtSecret);
const JWT_ALGORITHM = "HS256";

// Must stay in sync with JWT_COOKIE_NAME in src/server/auth/jwt.ts.
const JWT_COOKIE_NAME = "cl_token";

// Optimistic check only: signature + expiry. The database-backed check lives
// in getCurrentUser() (src/server/auth/jwt.ts).
async function hasValidToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
    return true;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(JWT_COOKIE_NAME)?.value;
  const isAuthPage = request.nextUrl.pathname === "/login";
  const isValid = await hasValidToken(token);

  if (!isValid && !isAuthPage) {
    // 303 forces a GET so failed server-action POSTs don't re-POST to /login.
    const status =
      request.method === "GET" || request.method === "HEAD" ? 307 : 303;
    const response = NextResponse.redirect(
      new URL("/login", request.url),
      status,
    );
    // Drop expired/tampered cookies instead of resending them every request.
    if (token) response.cookies.delete(JWT_COOKIE_NAME);
    return response;
  }

  // Valid-token users are intentionally NOT redirected away from /login here.
  // The proxy can't see the database, so a cookie for a deleted/inactive user
  // would bounce / -> /login -> / forever. The /login page decides instead.
  const response = NextResponse.next();
  if (!isValid && token) response.cookies.delete(JWT_COOKIE_NAME);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes — protected by requireUser() reading the session cookie)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - any path with a file extension (favicon.ico, public assets)
     */
    "/((?!api|_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)",
  ],
};
