"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

type ParamValue = string | number | boolean | null | undefined;

/** Empty / false / -1 values remove the param so URLs stay clean and defaults are implicit. */
const isEmpty = (v: ParamValue) =>
  v === undefined || v === null || v === "" || v === false || v === -1;

export function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const update = useCallback(
    (changes: Record<string, ParamValue>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (isEmpty(value)) next.delete(key);
        else next.set(key, value === true ? "1" : String(value));
      }
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [router, pathname, searchParams],
  );

  return { searchParams, update, isPending };
}
