import "server-only";
import { revalidatePath } from "next/cache";

export type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/**
 * requireUser()/requireAdmin() enforce auth by *throwing* a NEXT_REDIRECT
 * error. That error must never be swallowed by a catch block — rethrow it
 * so Next.js can perform the redirect instead of turning it into a
 * `{ ok: false }` result.
 */
export function rethrowIfRedirect(err: unknown): void {
  if (!(err instanceof Error)) return;
  const digest = (err as Error & { digest?: unknown }).digest;
  if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
    throw err;
  }
}

/** Runs an action body, turning any thrown error into `{ ok: false }`. */
export async function runAction<T>(
  fallbackError: string,
  body: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await body();
  } catch (err: unknown) {
    rethrowIfRedirect(err);
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message || fallbackError };
  }
}

/** Site / category / person-type changes show up in the layout (header pill, pickers). */
export const revalidateAllPages = () => revalidatePath("/", "layout");

export function revalidatePaths(...paths: string[]): void {
  for (const path of paths) revalidatePath(path);
}

export const revalidateLedgerPages = (personId: number) =>
  revalidatePaths(
    "/",
    "/persons",
    `/persons/${personId}`,
    "/sites",
    "/ledgers",
  );

export const revalidateExpensePages = () =>
  revalidatePaths("/", "/sites", "/expenses");

export const SITE_ACCESS_DENIED = "You do not have access to this site";
export const SITE_INACTIVE = "This site is inactive";
