import "server-only";
import Link from "next/link";
import { CreditDebitHero, StatTile } from "@/features/overview/OverviewSummary";
import { AppHeader } from "@/features/shell/AppHeader";
import { displayDate } from "@/lib/format";
import { requireUser } from "@/server/auth/jwt";
import { getOverviewData } from "@/server/queries/overview";
import { ActivityListClient } from "./ActivityListClient";

export default async function OverviewPage() {
  const user = await requireUser();
  // The overview always covers every site the user can access.
  const data = await getOverviewData({ siteId: -1, user });

  const recentActivity = data.recentActivity.map((item) => ({
    k: item.k,
    id: item.id,
    title: item.title,
    type: item.type,
    amount: item.amount,
    date: displayDate(item.date),
    siteName: item.siteName ?? "No site",
  }));

  return (
    <>
      <AppHeader user={user} title="Overview" />

      <div className="space-y-4 px-4 pb-4 pt-3 md:px-6 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6 lg:space-y-0 lg:px-8">
        <section
          aria-label="Summary"
          className="space-y-4 lg:sticky lg:top-6 lg:col-span-5 xl:col-span-4"
        >
          <CreditDebitHero credit={data.credit} debit={data.debit} />
          <div className="grid grid-cols-3 gap-2.5">
            <StatTile value={data.personsCount} label="Persons" />
            <StatTile value={data.entriesCount} label="Entries" />
            <StatTile value={data.expensesCount} label="Expenses" />
          </div>
          <Link
            href="/categories"
            className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-sm font-bold text-slate-800 no-underline shadow-xs transition-colors hover:border-amber-300"
          >
            <span>🏷️ Spending by category</span>
            <span aria-hidden className="text-slate-400">
              ›
            </span>
          </Link>
        </section>

        <section
          aria-labelledby="recent-activity"
          className="space-y-3 lg:col-span-7 xl:col-span-8"
        >
          <div className="flex items-center justify-between pt-1">
            <h2
              id="recent-activity"
              className="text-base font-extrabold text-slate-900"
            >
              Recent Activity
            </h2>
            <Link
              href="/ledgers"
              className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-600 no-underline transition-colors hover:text-amber-700"
            >
              View all →
            </Link>
          </div>
          <ActivityListClient entries={recentActivity} />
        </section>
      </div>
    </>
  );
}
