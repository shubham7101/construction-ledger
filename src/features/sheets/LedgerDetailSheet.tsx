"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type React from "react";
import { useEffect, useState, useTransition } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { toast } from "@/components/ui/Toast";
import { useSheet } from "@/hooks/useSheet";
import { displayDate } from "@/lib/format";
import { modeLabel } from "@/lib/labels";
import {
  deleteLedgerEntryAction,
  getLedgerEntryAction,
  type LedgerEntryDetail,
} from "@/server/actions/ledger";
import {
  DetailHeader,
  DetailRows,
  DetailSkeleton,
  RecordActions,
} from "./RecordDetail";

export const LedgerDetailSheet: React.FC = () => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { sheet, searchParams, openSheet, closeSheet } = useSheet();

  const rawId = sheet === "entry" ? searchParams.get("id") : null;
  const entryId = rawId && /^\d+$/.test(rawId) ? Number(rawId) : null;

  // One row, fetched when the sheet opens — the entry is never serialised
  // into pages that don't show it.
  const [detail, setDetail] = useState<LedgerEntryDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (entryId === null) {
      setDetail(null);
      return;
    }
    let stale = false;
    setLoading(true);
    getLedgerEntryAction(entryId)
      .then((row) => {
        if (!stale) setDetail(row);
      })
      .catch(() => {
        if (!stale) setDetail(null);
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [entryId]);

  if (entryId === null) return null;

  const handleDelete = () => {
    startTransition(async () => {
      const res = await deleteLedgerEntryAction(entryId);
      if (res.ok) {
        toast("Ledger entry deleted");
        closeSheet();
        router.refresh();
      } else {
        toast(res.error);
      }
    });
  };

  return (
    <BottomSheet isOpen onClose={closeSheet}>
      {loading && <DetailSkeleton />}

      {!loading && !detail && (
        <p className="py-6 text-center text-sm font-semibold text-red-500">
          Entry not found
        </p>
      )}

      {!loading && detail && (
        <>
          <DetailHeader
            tone={(detail.mirrored ?? detail).type}
            amount={detail.amount}
            title={(detail.mirrored ?? detail).personName}
            subtitle={
              <Link
                href={`/persons/${(detail.mirrored ?? detail).personId}`}
                className="text-xs font-bold text-amber-600 no-underline hover:text-amber-700"
              >
                Open passbook →
              </Link>
            }
          />
          <DetailRows
            rows={[
              ["Date", displayDate(detail.date)],
              ["Site", detail.siteName ?? "No site"],
              ["Category", detail.category],
              ["Payment mode", modeLabel(detail.mode)],
              ["Recorded by", detail.recordedBy],
            ]}
            note={detail.note}
          />
          <RecordActions
            canEdit={detail.canEdit}
            noun="entry"
            isPending={isPending}
            onEdit={() => openSheet("add", { k: "ledger", ed: detail.id })}
            onDelete={handleDelete}
          />
        </>
      )}
    </BottomSheet>
  );
};
