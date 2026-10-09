"use client";

import { useEffect, useState } from "react";
import { loadReferenceOptions, loadUserOptions } from "@/lib/reference-cache";
import type { ReferenceOptions, UserOption } from "@/server/actions/reference";
import type { FilterNames } from "./config";

/**
 * Site / category / user names for filter labels. Each list is fetched only
 * once something needs a name from it, then served from the session cache.
 */
export function useFilterNames(need: {
  reference: boolean;
  users: boolean;
}): FilterNames {
  const [reference, setReference] = useState<ReferenceOptions | null>(null);
  const [users, setUsers] = useState<UserOption[] | null>(null);

  useEffect(() => {
    if (!need.reference || reference) return;
    let stale = false;
    loadReferenceOptions()
      .then((rows) => {
        if (!stale) setReference(rows);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [need.reference, reference]);

  useEffect(() => {
    if (!need.users || users) return;
    let stale = false;
    loadUserOptions()
      .then((rows) => {
        if (!stale) setUsers(rows);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [need.users, users]);

  return {
    site: (id) => reference?.sites.find((s) => s.id === id)?.name,
    category: (id) => reference?.categories.find((c) => c.id === id)?.name,
    user: (id) => users?.find((u) => u.id === id)?.name,
  };
}
