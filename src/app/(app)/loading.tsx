/**
 * Shown the moment a tab or link is tapped, while the page's queries run.
 * Without it the old screen stays put until every query has finished.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse">
      <span className="sr-only">Loading…</span>

      {/* Mirrors AppHeader so the layout doesn't jump when the page lands. */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 bg-white/90 px-4 pb-2.5 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] md:border-0 md:bg-transparent md:px-6 md:pb-2 md:pt-6 lg:px-8">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-slate-200 md:hidden" />
          <div className="space-y-1.5">
            <div className="h-2.5 w-24 rounded bg-slate-200 md:hidden" />
            <div className="h-5 w-32 rounded bg-slate-200 md:h-7 md:w-44" />
          </div>
        </div>
        <div className="h-10 w-24 rounded-full bg-slate-200" />
      </div>

      <div className="space-y-4 px-4 pb-4 pt-3 md:px-6 lg:px-8">
        <div className="h-28 rounded-2xl bg-slate-200" />
        <div className="space-y-2.5">
          {Array.from({ length: 6 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
            <div key={i} className="h-16 rounded-2xl bg-slate-200/80" />
          ))}
        </div>
      </div>
    </div>
  );
}
