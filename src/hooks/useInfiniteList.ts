"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface PageData<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Infinite scroll over a server-paged list. `first` is the page the server
 * rendered; when it changes (filters changed, or router.refresh() after a
 * save) the list starts over from it. Attach `sentinelRef` to an element
 * after the last row: the next page loads as it nears the viewport.
 */
export function useInfiniteList<T>(
  first: PageData<T>,
  loadPage: (cursor: string) => Promise<PageData<T>>,
) {
  const [page, setPage] = useState(first);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // Restart from a new server-rendered first page (derived-state pattern).
  const [prevFirst, setPrevFirst] = useState(first);
  if (first !== prevFirst) {
    setPrevFirst(first);
    setPage(first);
    setFailed(false);
  }

  const inFlight = useRef(false);
  const loadMore = useCallback(async () => {
    const cursor = page.nextCursor;
    if (!cursor || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const next = await loadPage(cursor);
      // Ignore a late reply if the list restarted meanwhile.
      setPage((prev) =>
        prev.nextCursor === cursor
          ? {
              items: [...prev.items, ...next.items],
              nextCursor: next.nextCursor,
            }
          : prev,
      );
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [page.nextCursor, loadPage]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !page.nextCursor || failed) return;
    // A fresh observer reports immediately if the sentinel is already
    // visible, so short pages keep loading until the screen is full.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadMore();
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore, page.nextCursor, failed]);

  return {
    items: page.items,
    hasMore: page.nextCursor !== null,
    loading,
    failed,
    retry: loadMore,
    sentinelRef,
  };
}
