import type { ReferenceOptions } from "@/server/actions/reference";
import { getReferenceOptionsAction } from "@/server/actions/reference";

let cached: ReferenceOptions | null = null;
let inflight: Promise<ReferenceOptions> | null = null;

/**
 * The picker's small option lists (sites, categories, person types), fetched
 * from the server on first open and reused for the rest of the session —
 * the sheets are mounted once, so this is effectively a client-side session
 * cache with no extra requests on later opens.
 */
export function loadReferenceOptions(): Promise<ReferenceOptions> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = getReferenceOptionsAction()
      .then((rows) => {
        cached = rows;
        inflight = null;
        return rows;
      })
      .catch((err: unknown) => {
        inflight = null;
        throw err;
      });
  }
  return inflight;
}

/** Call after creating a site / category / person type so the next open is fresh. */
export function invalidateReferenceOptions(): void {
  cached = null;
}
