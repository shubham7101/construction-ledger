"use client";

import { useRouter } from "next/navigation";
import type React from "react";
import { useEffect, useState, useTransition } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { toast } from "@/components/ui/Toast";
import { useSheet } from "@/hooks/useSheet";
import { displayDate } from "@/lib/format";
import {
  deleteExpenseAction,
  type ExpenseDetail,
  getExpenseAction,
} from "@/server/actions/expense";
import {
  DetailHeader,
  DetailRows,
  DetailSkeleton,
  RecordActions,
} from "./RecordDetail";

export const ExpenseDetailSheet: React.FC = () => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { sheet, searchParams, openSheet, closeSheet } = useSheet();

  const rawId = sheet === "expense" ? searchParams.get("id") : null;
  const expenseId = rawId && /^\d+$/.test(rawId) ? Number(rawId) : null;

  // One row, fetched when the sheet opens.
  const [detail, setDetail] = useState<ExpenseDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (expenseId === null) {
      setDetail(null);
      return;
    }
    let stale = false;
    setLoading(true);
    getExpenseAction(expenseId)
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
  }, [expenseId]);

  if (expenseId === null) return null;

  const handleDelete = () => {
    startTransition(async () => {
      const res = await deleteExpenseAction(expenseId);
      if (res.ok) {
        toast("Expense deleted");
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
          Expense not found
        </p>
      )}

      {!loading && detail && (
        <>
          <DetailHeader
            tone="expense"
            amount={detail.amount}
            title={detail.note || detail.category}
          />
          <DetailRows
            rows={[
              ["Date", displayDate(detail.date)],
              ["Site", detail.siteName],
              ["Category", detail.category],
              ["Recorded by", detail.recordedBy],
            ]}
          />
          <RecordActions
            canEdit={detail.canEdit}
            noun="expense"
            isPending={isPending}
            onEdit={() => openSheet("add", { k: "exp", ed: detail.id })}
            onDelete={handleDelete}
          />
        </>
      )}
    </BottomSheet>
  );
};
