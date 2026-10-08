import type React from "react";

/** Sits after the last row: shows loading / retry and triggers the next page. */
export const ListSentinel: React.FC<{
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  hasMore: boolean;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}> = ({ sentinelRef, hasMore, loading, failed, onRetry }) => (
  <div ref={sentinelRef} className="py-3 text-center text-xs text-slate-500">
    {failed ? (
      <button
        type="button"
        onClick={onRetry}
        className="min-h-10 cursor-pointer rounded-full border border-slate-300 bg-white px-4 font-semibold text-slate-700 hover:bg-slate-50"
      >
        Couldn’t load more · Retry
      </button>
    ) : loading ? (
      <span aria-live="polite">Loading more…</span>
    ) : hasMore ? (
      <span className="sr-only">More entries load as you scroll</span>
    ) : null}
  </div>
);
