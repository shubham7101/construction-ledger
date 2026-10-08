"use client";

import clsx from "clsx";
import { usePathname, useRouter } from "next/navigation";
import type React from "react";
import { useEffect, useState, useTransition } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FieldButton } from "@/components/ui/FieldButton";
import { Segmented } from "@/components/ui/Segmented";
import { toast } from "@/components/ui/Toast";
import { useSheet } from "@/hooks/useSheet";
import { todayIso } from "@/lib/format";
import { modeLabel, modeValue } from "@/lib/labels";
import { loadReferenceOptions } from "@/lib/reference-cache";
import {
  createExpenseAction,
  getExpenseAction,
  updateExpenseAction,
} from "@/server/actions/expense";
import {
  createLedgerEntryAction,
  getLedgerEntryAction,
  updateLedgerEntryAction,
} from "@/server/actions/ledger";
import {
  createPersonAction,
  getPersonAction,
  updatePersonAction,
} from "@/server/actions/person";
import {
  getPersonOptionAction,
  searchPersonsAction,
} from "@/server/actions/reference";
import type { AddModalState } from "@/types";
import { DetailSkeleton } from "./RecordDetail";
import {
  type PickerKind,
  SearchablePickerSheet,
} from "./SearchablePickerSheet";

type SiteOption = { id: number; name: string };

/** [stored value, short label] — "Bank" keeps all four on one row on phones. */
const PAYMENT_MODES = [
  ["Cash", "Cash"],
  ["UPI", "UPI"],
  ["Bank Transfer", "Bank"],
  ["Cheque", "Cheque"],
] as const;

type PaymentMode = (typeof PAYMENT_MODES)[number][0];

const AMOUNT_TONES = {
  credit: {
    box: "border-emerald-200 focus-within:border-emerald-500",
    text: "text-emerald-600",
  },
  debit: {
    box: "border-red-200 focus-within:border-red-500",
    text: "text-red-600",
  },
  expense: {
    box: "border-indigo-200 focus-within:border-indigo-500",
    text: "text-indigo-600",
  },
} as const;

/** Same "name · mobile" label the person picker produces. */
const personOptionLabel = (p: { name: string; mobile: string }) =>
  `${p.name} · ${p.mobile}`;

const ADD_KINDS: string[] = ["ledger", "exp", "person"];

interface PickerTarget {
  f: "pid" | "s" | "c" | "t";
  k: PickerKind;
}

export const AddEditSheet: React.FC<{ sites?: SiteOption[] }> = ({
  sites = [],
}) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { sheet, searchParams, closeSheet, dismissSheet } = useSheet();
  const pathname = usePathname();

  /*
   * The draft lives here (local state), not in a store: the URL only says
   * *which* sheet is open and of which kind. Initialised when the sheet
   * opens, cleared when it closes — and it survives the nested picker
   * because opening the picker never unmounts this component.
   */
  const [add, setAdd] = useState<AddModalState | null>(null);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const showToast = toast;

  const rawKind = sheet === "add" ? searchParams.get("k") : null;
  const kind =
    rawKind && ADD_KINDS.includes(rawKind)
      ? (rawKind as AddModalState["k"])
      : null;
  // ?ed=<id> edits an existing ledger entry, expense or person.
  const rawEd = sheet === "add" ? searchParams.get("ed") : null;
  const editId = kind && rawEd && /^\d+$/.test(rawEd) ? Number(rawEd) : null;
  const [loadingEdit, setLoadingEdit] = useState(false);

  // Presets for a new entry: ?pid= & ?dir= (from a passbook's Credit / Debit
  // buttons) and the site in view — a site's own page, else the ?site= filter.
  const idParam = (key: string) => {
    const v = searchParams.get(key);
    return v && /^\d+$/.test(v) ? Number(v) : null;
  };
  const presetPid = kind === "ledger" ? idParam("pid") : null;
  const presetDir = searchParams.get("dir") === "debit" ? "debit" : "credit";
  const sitePage = /^\/sites\/(\d+)$/.exec(pathname);
  const presetSite = sitePage ? Number(sitePage[1]) : (idParam("site") ?? -1);

  useEffect(() => {
    if (sheet === "add" && kind) {
      setAdd({
        k: kind,
        t: kind === "ledger" ? presetDir : "",
        s: presetSite,
        ...(presetPid !== null ? { pid: presetPid } : {}),
        c: "",
        p: "UPI",
        n: "",
        m: "",
        m2: "",
        em: "",
        ad: "",
        note: "",
        date: todayIso(),
        ...(editId !== null ? { ed: editId } : {}),
      });
    } else {
      setAdd(null);
    }
    setPicker(null);
  }, [sheet, kind, editId, presetDir, presetSite, presetPid]);

  // Fill the form: editing loads the record (one row); adding preselects the
  // first category and, for ledgers, the first person — never whole lists.
  useEffect(() => {
    if (sheet !== "add" || !kind) return;
    // A new person needs nothing preloaded.
    if (kind === "person" && editId === null) return;
    let stale = false;
    const fill = (
      patch: Partial<AddModalState>,
      onlyIfEmpty?: keyof AddModalState,
    ) =>
      setAdd((prev) =>
        prev?.k === kind && (!onlyIfEmpty || !prev[onlyIfEmpty])
          ? { ...prev, ...patch }
          : prev,
      );

    if (editId !== null) {
      setLoadingEdit(true);
      const load: Promise<Partial<AddModalState> | null> =
        kind === "person"
          ? getPersonAction(editId).then(
              (d) =>
                d && {
                  n: d.name,
                  m: d.mobile,
                  m2: d.mobile2,
                  em: d.email,
                  ad: d.address,
                  t: d.personType,
                  ptId: d.personTypeId,
                },
            )
          : kind === "ledger"
            ? getLedgerEntryAction(editId).then(
                (d) =>
                  d && {
                    pid: d.personId,
                    personLabel: d.personName,
                    t: d.type,
                    a: d.amount,
                    s: d.siteId ?? -1,
                    c: d.category,
                    p: modeLabel(d.mode),
                    note: d.note,
                    date: d.date,
                  },
              )
            : getExpenseAction(editId).then(
                (d) =>
                  d && {
                    a: d.amount,
                    s: d.siteId,
                    c: d.category,
                    note: d.note,
                    date: d.date,
                  },
              );
      load
        .then((patch) => {
          if (stale) return;
          if (patch) {
            fill(patch);
          } else {
            toast("This record no longer exists");
            closeSheet();
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!stale) setLoadingEdit(false);
        });
    } else {
      loadReferenceOptions()
        .then(({ categories }) => {
          if (!stale && categories[0]) fill({ c: categories[0].name }, "c");
        })
        .catch(() => {});
      if (kind === "ledger" && presetPid !== null) {
        getPersonOptionAction(presetPid)
          .then((person) => {
            if (!stale && person) {
              fill({ personLabel: personOptionLabel(person) }, "personLabel");
            }
          })
          .catch(() => {});
      } else if (kind === "ledger") {
        searchPersonsAction("", 1)
          .then(([first]) => {
            if (!stale && first) {
              fill(
                { pid: first.id, personLabel: personOptionLabel(first) },
                "pid",
              );
            }
          })
          .catch(() => {});
      }
    }
    return () => {
      stale = true;
    };
  }, [sheet, kind, editId, presetPid, closeSheet]);

  if (!add) return null;

  const titles: Record<string, string> = {
    person: add.ed != null ? "Edit Person" : "Add Person",
    exp: add.ed != null ? "Edit Expense" : "Add Expense",
    ledger: add.ed != null ? "Edit Ledger Entry" : "Add Ledger Entry",
  };

  const title = titles[add.k] || "Add New";
  const isEditing = add.ed != null;

  /** The picker stores the category's name; the actions need its id. */
  const resolveCategoryId = async () => {
    const { categories } = await loadReferenceOptions();
    return categories.find((c) => c.name === add.c)?.id;
  };
  const addRecord = add as unknown as Record<string, unknown>;

  /** Human label for a site field — falls back to `Site #id` if not found. */
  const siteLabel = (id: number | string | undefined, fallback: string) => {
    const numId = typeof id === "string" ? Number(id) : id;
    if (typeof numId !== "number" || Number.isNaN(numId) || numId < 0) {
      return fallback;
    }
    return sites.find((s) => s.id === numId)?.name ?? `Site #${numId}`;
  };

  const handleSave = () => {
    startTransition(async () => {
      let res: { ok: boolean; error?: string } = {
        ok: false,
        error: "Invalid action",
      };

      if (add.k === "person") {
        if (!add.n) {
          showToast("Please enter a name");
          return;
        }

        // Validate Indian mobile number format (10 digits)
        const cleanMobile = (add.m || "").replace(/[\D]/g, "");
        if (!cleanMobile || cleanMobile.length !== 10) {
          showToast("Indian mobile numbers must be exactly 10 digits");
          return;
        }

        // The picker stores the type's name; resolve it to its id. When
        // editing, an unchanged type keeps its id even if it's now inactive.
        const { personTypes } = await loadReferenceOptions();
        const personTypeId =
          personTypes.find((pt) => pt.name === add.t)?.id ?? add.ptId;
        if (!personTypeId || !add.t) {
          showToast("Please select a person type");
          return;
        }

        const personData = {
          name: add.n,
          mobile: add.m || "", // the server cleans "+91 98…" to 10 digits
          mobile2: add.m2 || "",
          email: add.em || "",
          address: add.ad || "",
          personTypeId,
        };
        res =
          add.ed != null
            ? await updatePersonAction(add.ed, personData)
            : await createPersonAction(personData);
      } else if (add.k === "exp") {
        const numAmount = Math.round(Number(add.a));
        if (!numAmount || numAmount <= 0) {
          showToast("Please enter a valid amount");
          return;
        }
        // Expenses always belong to a site — never guess one.
        if (typeof add.s !== "number" || add.s < 0) {
          showToast("Please select a site");
          return;
        }
        if (!add.date) {
          showToast("Please select a date");
          return;
        }
        const categoryId = await resolveCategoryId();
        if (!categoryId) {
          showToast("Please select a category");
          return;
        }
        const expenseData = {
          amount: numAmount,
          date: add.date,
          siteId: add.s,
          categoryId,
          note: add.note || "",
        };
        res =
          add.ed != null
            ? await updateExpenseAction(add.ed, expenseData)
            : await createExpenseAction(expenseData);
      } else if (add.k === "ledger") {
        const numAmount = Math.round(Number(add.a));
        if (!numAmount || numAmount <= 0 || !add.pid) {
          showToast("Please select a person and enter a valid amount");
          return;
        }
        if (!add.date) {
          showToast("Please select a date");
          return;
        }
        const categoryId = await resolveCategoryId();
        if (!categoryId) {
          showToast("Please select a category");
          return;
        }
        const ledgerData = {
          personId: add.pid,
          type: add.t === "debit" ? ("debit" as const) : ("credit" as const),
          amount: numAmount,
          date: add.date,
          siteId: typeof add.s === "number" && add.s >= 0 ? add.s : null,
          categoryId,
          mode: modeValue(add.p),
          note: add.note || "",
        };
        res =
          add.ed != null
            ? await updateLedgerEntryAction(add.ed, ledgerData)
            : await createLedgerEntryAction(ledgerData);
      }

      if (res.ok) {
        showToast("Saved successfully");
        closeSheet();
        router.refresh();
      } else {
        showToast(res.error || "Failed to save");
      }
    });
  };

  /** Date + note share one row: both are secondary, and it saves a row. */
  const renderDateAndNote = () => (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
      <label className="flex min-h-12 flex-col justify-center rounded-xl border border-slate-200 bg-white px-3 shadow-sm focus-within:border-amber-500">
        <span className="text-[11px] leading-tight text-slate-500">Date</span>
        <input
          type="date"
          required
          value={add.date ?? ""}
          max={todayIso()}
          onChange={(e) => setAdd({ ...add, date: e.target.value })}
          className="min-h-0 bg-transparent text-sm font-semibold text-slate-900 outline-none"
        />
      </label>
      {renderInput("Note (optional)", "note")}
    </div>
  );

  const renderInput = (
    placeholder: string,
    field: string,
    type: "text" | "number" | "tel" | "email" = "text",
  ) => (
    <input
      type={type}
      inputMode={type === "number" || type === "tel" ? "numeric" : undefined}
      placeholder={placeholder}
      aria-label={placeholder}
      value={String(addRecord[field] || "")}
      onChange={(e) => setAdd({ ...add, [field]: e.target.value })}
      className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-slate-900 shadow-sm outline-none focus:border-amber-500"
    />
  );

  /** ₹ amount box, tinted to match what the money is (credit / debit / expense). */
  const renderAmount = (tone: keyof typeof AMOUNT_TONES) => (
    <label
      className={clsx(
        "flex min-h-12 min-w-0 flex-1 items-center gap-1 rounded-xl border bg-white px-3 shadow-sm",
        AMOUNT_TONES[tone].box,
      )}
    >
      <span aria-hidden className="text-lg font-bold text-slate-400">
        ₹
      </span>
      <input
        type="number"
        inputMode="numeric"
        aria-label="Amount"
        placeholder="0"
        value={add.a || ""}
        onChange={(e) => setAdd({ ...add, a: e.target.value })}
        className={clsx(
          "w-full min-w-0 bg-transparent text-2xl font-extrabold outline-none",
          AMOUNT_TONES[tone].text,
        )}
      />
    </label>
  );

  const isCredit = add.t === "credit";

  return (
    <BottomSheet isOpen={Boolean(add)} onClose={dismissSheet} title={title}>
      <div className="space-y-2.5 pt-1">
        {add.k === "person" && !loadingEdit && (
          <>
            {renderInput("Name", "n")}
            <div className="grid grid-cols-2 gap-2">
              {renderInput("Mobile (10 digits)", "m", "tel")}
              {renderInput("2nd mobile (optional)", "m2", "tel")}
            </div>
            <FieldButton
              compact
              label="Person type"
              value={add.t || "Select person type"}
              onClick={() => setPicker({ f: "t", k: "ptype" })}
            />
            {renderInput("Email (optional)", "em", "email")}
            {renderInput("Address (optional)", "ad")}
          </>
        )}

        {loadingEdit && <DetailSkeleton />}

        {add.k === "exp" && !loadingEdit && (
          <>
            {renderAmount("expense")}
            <div className="grid grid-cols-2 gap-2">
              <FieldButton
                compact
                label="Site"
                value={siteLabel(add.s, "Select site")}
                onClick={() => setPicker({ f: "s", k: "site" })}
              />
              <FieldButton
                compact
                label="Category"
                value={add.c || "Select category"}
                onClick={() => setPicker({ f: "c", k: "cat" })}
              />
            </div>
            {renderDateAndNote()}
          </>
        )}

        {add.k === "ledger" && !loadingEdit && (
          <>
            <FieldButton
              compact
              label="Person"
              value={add.personLabel || "Select person"}
              onClick={() => setPicker({ f: "pid", k: "person" })}
            />

            {/* Direction and amount share a row: the colour ties them together. */}
            <div className="flex gap-2">
              <fieldset
                aria-label="Entry type"
                className="grid shrink-0 grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
              >
                <button
                  type="button"
                  aria-pressed={isCredit}
                  onClick={() => setAdd({ ...add, t: "credit" })}
                  className={clsx(
                    "min-h-10 cursor-pointer rounded-lg border-none px-3 text-xs font-bold transition-colors",
                    isCredit
                      ? "bg-emerald-500 text-slate-950 shadow-sm"
                      : "bg-transparent text-slate-500",
                  )}
                >
                  + Credit
                </button>
                <button
                  type="button"
                  aria-pressed={!isCredit}
                  onClick={() => setAdd({ ...add, t: "debit" })}
                  className={clsx(
                    "min-h-10 cursor-pointer rounded-lg border-none px-3 text-xs font-bold transition-colors",
                    !isCredit
                      ? "bg-red-500 text-white shadow-sm"
                      : "bg-transparent text-slate-500",
                  )}
                >
                  − Debit
                </button>
              </fieldset>

              {renderAmount(isCredit ? "credit" : "debit")}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <FieldButton
                compact
                label="Site"
                value={siteLabel(add.s, "No site")}
                onClick={() => setPicker({ f: "s", k: "siten" })}
              />
              <FieldButton
                compact
                label="Category"
                value={add.c || "Select category"}
                onClick={() => setPicker({ f: "c", k: "cat" })}
              />
            </div>

            <Segmented<PaymentMode>
              ariaLabel="Payment mode"
              options={PAYMENT_MODES}
              value={(add.p as PaymentMode) || "UPI"}
              onChange={(p) => setAdd({ ...add, p })}
            />

            {renderDateAndNote()}
          </>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || loadingEdit}
          className="min-h-12 w-full cursor-pointer rounded-xl bg-amber-500 text-base font-extrabold text-slate-950 hover:bg-amber-600 disabled:opacity-50"
        >
          {isPending ? "Saving..." : isEditing ? "Save changes" : "Save"}
        </button>
      </div>

      {/* The picker stacks on top of this form; the draft above stays mounted. */}
      {picker && (
        <SearchablePickerSheet
          kind={picker.k}
          value={addRecord[picker.f] as string | number | undefined}
          onChange={(value, label) => {
            const target: PickerTarget = picker;
            setAdd({
              ...add,
              [target.f]: value,
              ...(target.k === "person" ? { personLabel: label } : {}),
            });
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </BottomSheet>
  );
};
