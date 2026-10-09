"use client";

import { useSearchParams } from "next/navigation";
import { useCallback } from "react";
import {
  buildSheetUrl,
  isSheetParam,
  parseSheetKind,
  type SheetKind,
} from "@/lib/sheet-params";

export { isSheetParam };

/**
 * The URL pushed when a sheet was opened *on top of* another one (menu → form,
 * details → edit), so dismissing it can step back instead of closing
 * everything. Module state on purpose: a reload clears it, and dismissing then
 * falls back to a plain close.
 */
let steppedUrl: string | null = null;

/**
 * Which dialog is open, expressed as `?sheet=...` (+ small aux params).
 *
 * Visibility lives in the URL so it survives navigation, works with the
 * browser Back button, and needs no global store. Writes go through the
 * native history API, which Next.js syncs with `useSearchParams` *without*
 * re-running server components — opening a sheet never triggers a server
 * round-trip, unlike the data-affecting params (site, type, dm...) which
 * deliberately use `router.replace` so the page re-queries.
 *
 * The pure param logic lives in `src/lib/sheet-params.ts`.
 */
export function useSheet() {
  const searchParams = useSearchParams();

  /**
   * Opens a sheet (replacing any other). Uses pushState so the browser Back
   * button closes the sheet, and so history stays free of open/close noise
   * because closing replaces the entry instead of pushing another one.
   */
  const openSheet = useCallback(
    (kind: SheetKind, aux: Record<string, string | number> = {}) => {
      const fromSheet = parseSheetKind(
        new URL(window.location.href).searchParams.get("sheet"),
      );
      window.history.pushState(
        null,
        "",
        buildSheetUrl(window.location.href, { ...aux, sheet: kind }),
      );
      steppedUrl = fromSheet ? window.location.href : null;
    },
    [],
  );

  const closeSheet = useCallback(() => {
    steppedUrl = null;
    window.history.replaceState(
      null,
      "",
      buildSheetUrl(window.location.href, {}),
    );
  }, []);

  /**
   * Dismiss (✕, backdrop, Escape): returns to the sheet this one was opened
   * from, if any; otherwise closes. Use closeSheet() after a successful save.
   */
  const dismissSheet = useCallback(() => {
    if (steppedUrl !== null && steppedUrl === window.location.href) {
      steppedUrl = null;
      window.history.back();
    } else {
      closeSheet();
    }
  }, [closeSheet]);

  return {
    sheet: parseSheetKind(searchParams.get("sheet")),
    searchParams,
    openSheet,
    closeSheet,
    dismissSheet,
  };
}
