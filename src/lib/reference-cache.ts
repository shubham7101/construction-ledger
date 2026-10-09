import type { ReferenceOptions, UserOption } from "@/server/actions/reference";
import {
  getReferenceOptionsAction,
  getUserOptionsAction,
} from "@/server/actions/reference";

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

let cachedUsers: UserOption[] | null = null;
let usersInflight: Promise<UserOption[]> | null = null;

/** Call after creating / renaming / (de)activating a user. */
export function invalidateUserOptions(): void {
  cachedUsers = null;
}

/** The admins' "Logged by" options, cached for the session like the above. */
export function loadUserOptions(): Promise<UserOption[]> {
  if (cachedUsers) return Promise.resolve(cachedUsers);
  if (!usersInflight) {
    usersInflight = getUserOptionsAction()
      .then((rows) => {
        cachedUsers = rows;
        usersInflight = null;
        return rows;
      })
      .catch((err: unknown) => {
        usersInflight = null;
        throw err;
      });
  }
  return usersInflight;
}
