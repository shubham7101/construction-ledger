"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { PersonSearchSheet } from "@/components/ui/PersonSearchSheet";
import { Segmented } from "@/components/ui/Segmented";
import {
  MODE_OPTIONS,
  paramsFor,
  type Section,
  SORT_OPTIONS,
  STAGE_OPTIONS,
  sectionsFor,
  TYPE_OPTIONS,
} from "@/features/filters/config";
import { useSheet } from "@/hooks/useSheet";
import { useUrlParams } from "@/hooks/useUrlParams";
import { loadReferenceOptions, loadUserOptions } from "@/lib/reference-cache";
import {
  getPersonOptionAction,
  type ReferenceOptions,
  type UserOption,
} from "@/server/actions/reference";
import type { FilterKey } from "@/types";

type DateMode = "any" | "day" | "range";
const SECTION_LABELS: Record<Section, string> = {
  by: "Logged by",
  site: "Site",
  person: "Person",
  category: "Category",
  type: "Type",
  mode: "Payment mode",
  date: "Date",
  amount: "Amount (₹)",
  sort: "Sort by",
  ptype: "Person type",
  scope: "Show",
  status: "Status",
  stage: "Status",
};

const SELECT_CLASS =
  "min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus:border-amber-500";

/** Every param a section edits, as strings ("" = not set). */
type Draft = Record<string, string>;

/**
 * Every filter of the page it's opened for (`?fk=`), in one sheet: edits are
 * kept as a draft and applied together with Done, in one server navigation.
 */
export const FilterSheet: React.FC<{
  sites: ReadonlyArray<{ id: number; name: string }>;
  isAdmin: boolean;
}> = ({ sites, isAdmin }) => {
  const { update } = useUrlParams();
  const { sheet, searchParams, closeSheet } = useSheet();

  // Which page's filters we're editing lives in the URL next to `sheet`.
  const fk: FilterKey | null =
    sheet === "filter"
      ? ((searchParams.get("fk") as FilterKey | null) ?? null)
      : null;
  const sections = fk ? sectionsFor(fk, isAdmin) : [];
  const has = (s: Section) => sections.includes(s);

  const [draft, setDraft] = useState<Draft>({});
  const [personName, setPersonName] = useState<string | null>(null);
  const [pickingPerson, setPickingPerson] = useState(false);
  const [dm, setDm] = useState<DateMode>("any");
  const [d1, setD1] = useState(""); // YYYY-MM-DD
  const [d2, setD2] = useState("");
  // Hides the sheet the moment Done / Clear all is tapped, while the
  // navigation that drops ?sheet is still in flight.
  const [submitted, setSubmitted] = useState(false);

  const [reference, setReference] = useState<ReferenceOptions | null>(null);
  const [users, setUsers] = useState<UserOption[] | null>(null);

  const needsReference =
    fk !== null && sections.some((s) => s === "category" || s === "ptype");
  const needsUsers = fk !== null && sections.includes("by");
  const personId = Number(draft.person || -1);

  // Load the current URL state into the form each time the sheet opens.
  useEffect(() => {
    if (!fk) {
      setSubmitted(false);
      return;
    }
    const next: Draft = {};
    for (const p of paramsFor(fk, isAdmin)) next[p] = searchParams.get(p) ?? "";
    setDraft(next);
    setDm((searchParams.get("dm") as DateMode) || "any");
    setD1(searchParams.get("d1") || "");
    setD2(searchParams.get("d2") || "");
  }, [fk, isAdmin, searchParams]);

  useEffect(() => {
    if (!needsReference || reference) return;
    loadReferenceOptions()
      .then(setReference)
      .catch(() => {});
  }, [needsReference, reference]);

  useEffect(() => {
    if (!needsUsers || users) return;
    loadUserOptions()
      .then(setUsers)
      .catch(() => {});
  }, [needsUsers, users]);

  // The picked person's name, for the field's label.
  useEffect(() => {
    if (personId < 0) {
      setPersonName(null);
      return;
    }
    let stale = false;
    getPersonOptionAction(personId)
      .then((p) => {
        if (!stale) setPersonName(p?.name ?? null);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [personId]);

  if (!fk || submitted) return null;

  const set = (changes: Draft) => setDraft((prev) => ({ ...prev, ...changes }));

  const apply = () => {
    let iso1 = dm === "any" ? "" : d1;
    let iso2 = dm === "range" ? d2 : "";
    if (iso1 && iso2 && iso1 > iso2) [iso1, iso2] = [iso2, iso1]; // ISO strings sort chronologically

    // A reversed amount range is saved the way it was meant, like dates.
    const [amin, amax] = [draft.amin ?? "", draft.amax ?? ""];
    const amounts: Draft =
      amin && amax && Number(amin) > Number(amax)
        ? { amin: amax, amax: amin }
        : {};

    const values: Draft = {
      ...draft,
      ...amounts,
      ...(has("date")
        ? { dm: dm === "any" ? "" : dm, d1: iso1, d2: iso2 }
        : {}),
    };
    update({
      ...Object.fromEntries(
        paramsFor(fk, isAdmin).map((p) => [p, values[p] || undefined]),
      ),
      // Dropping ?sheet in the same navigation closes the sheet. Not
      // closeSheet(): its history.replaceState would race this navigation
      // and put the old params back.
      sheet: undefined,
      fk: undefined,
    });
    setSubmitted(true);
  };

  const clear = () => {
    update({
      ...Object.fromEntries(paramsFor(fk, isAdmin).map((p) => [p, undefined])),
      sheet: undefined,
      fk: undefined,
    });
    setSubmitted(true);
  };

  // The phone's own date picker: any year, nothing to keep up to date.
  const renderDate = (
    label: string,
    value: string,
    setter: React.Dispatch<React.SetStateAction<string>>,
  ) => (
    <label className="block">
      <span className="text-[11px] font-semibold text-slate-500">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => setter(e.target.value)}
        className={`${SELECT_CLASS} mt-1 block`}
      />
    </label>
  );

  const renderSelect = (
    label: string,
    value: string,
    options: ReadonlyArray<readonly [string, string]>,
    onChange: (value: string) => void,
  ) => (
    // Native picker (the phone's own list), with the same ▼ as the Person field.
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className={`${SELECT_CLASS} appearance-none pr-9`}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500"
      >
        ▼
      </span>
    </div>
  );

  const renderSection = (section: Section): React.ReactNode => {
    const label = SECTION_LABELS[section];
    switch (section) {
      case "by": {
        // One control for ?all and ?by: they never apply together.
        const value =
          Number(draft.by || -1) >= 0
            ? draft.by
            : draft.all === "1"
              ? "all"
              : "";
        return renderSelect(
          label,
          value,
          [
            ["", "Only me"],
            ["all", "All users"],
            ...(users ?? []).map(
              (u) =>
                [
                  String(u.id),
                  u.active ? u.name : `${u.name} (inactive)`,
                ] as const,
            ),
          ],
          (v) => set(v === "all" ? { all: "1", by: "" } : { all: "", by: v }),
        );
      }
      case "site":
        return renderSelect(
          label,
          draft.site && Number(draft.site) >= 0 ? draft.site : "",
          [
            ["", "All sites"],
            ...sites.map((s) => [String(s.id), s.name] as const),
          ],
          (v) => set({ site: v }),
        );
      case "person":
        return (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPickingPerson(true)}
              aria-haspopup="dialog"
              className={`${SELECT_CLASS} flex min-w-0 flex-1 cursor-pointer items-center justify-between text-left`}
            >
              <span className="truncate">
                {personId >= 0 ? (personName ?? "…") : "All persons"}
              </span>
              <span aria-hidden className="text-[10px] text-slate-500">
                ▼
              </span>
            </button>
            {personId >= 0 && (
              <button
                type="button"
                onClick={() => set({ person: "" })}
                aria-label="Clear person"
                className="min-h-12 shrink-0 cursor-pointer rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-500 hover:bg-slate-50"
              >
                ✕
              </button>
            )}
          </div>
        );
      case "category":
        return renderSelect(
          label,
          draft.category && Number(draft.category) >= 0 ? draft.category : "",
          [
            ["", "All categories"],
            ...(reference?.categories ?? []).map(
              (c) => [String(c.id), c.name] as const,
            ),
          ],
          (v) => set({ category: v }),
        );
      case "type": {
        const options = TYPE_OPTIONS[fk] ?? [];
        const fallback = options[0]?.[0] ?? "";
        const current =
          options.find(
            ([v]) => v.toLowerCase() === (draft.type || "").toLowerCase(),
          )?.[0] ?? fallback;
        return (
          <Segmented
            ariaLabel={label}
            options={options}
            value={current}
            onChange={(v) => set({ type: v === fallback ? "" : v })}
          />
        );
      }
      case "mode":
        return (
          <Segmented
            ariaLabel={label}
            options={MODE_OPTIONS}
            value={draft.mode ?? ""}
            onChange={(v) => set({ mode: v })}
          />
        );
      case "date":
        return (
          <div className="space-y-2">
            <Segmented
              ariaLabel={label}
              options={[
                ["any", "Any date"],
                ["day", "Exact date"],
                ["range", "Date range"],
              ]}
              value={dm}
              onChange={(v) => setDm(v as DateMode)}
            />
            {dm === "day" && renderDate("Date", d1, setD1)}
            {dm === "range" && (
              <div className="space-y-2">
                {renderDate("From date", d1, setD1)}
                {renderDate("To date", d2, setD2)}
              </div>
            )}
          </div>
        );
      case "amount": {
        const bound = (key: "amin" | "amax", placeholder: string) => (
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            placeholder={placeholder}
            aria-label={`${placeholder} amount`}
            value={draft[key] ?? ""}
            onChange={(e) =>
              set({ [key]: e.target.value.replace(/[^0-9]/g, "") })
            }
            className={`${SELECT_CLASS} min-w-0`}
          />
        );
        return (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            {bound("amin", "Min")}
            <span aria-hidden className="text-slate-400">
              –
            </span>
            {bound("amax", "Max")}
          </div>
        );
      }
      case "sort":
        return renderSelect(label, draft.sort || "az", SORT_OPTIONS, (v) =>
          set({ sort: v === "az" ? "" : v }),
        );
      case "ptype":
        return renderSelect(
          label,
          draft.ptype ?? "",
          [
            ["", "All types"],
            ...(reference?.personTypes ?? []).map(
              (t) => [t.name, t.name] as const,
            ),
          ],
          (v) => set({ ptype: v }),
        );
      case "scope":
        return (
          <Segmented
            ariaLabel={label}
            options={[
              ["", "My persons"],
              ["1", "All persons"],
            ]}
            value={draft.all === "1" ? "1" : ""}
            onChange={(v) => set({ all: v })}
          />
        );
      case "status":
        return (
          <Segmented
            ariaLabel={label}
            options={[
              ["", "Active"],
              ["inactive", "Inactive"],
            ]}
            value={draft.status === "inactive" ? "inactive" : ""}
            onChange={(v) => set({ status: v })}
          />
        );
      case "stage":
        return (
          <Segmented
            ariaLabel={label}
            options={STAGE_OPTIONS}
            value={draft.stage ?? ""}
            onChange={(v) => set({ stage: v })}
          />
        );
    }
  };

  return (
    <BottomSheet isOpen onClose={closeSheet} title="Filters">
      <div className="space-y-4 pt-1">
        {sections.map((section) => (
          <div key={section} className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {SECTION_LABELS[section]}
            </p>
            {renderSection(section)}
          </div>
        ))}

        {/* Pinned to the bottom so Done stays in reach when the sheet scrolls. */}
        <div className="sticky -bottom-6 -mx-5 grid grid-cols-2 gap-2 border-t border-slate-100 bg-white px-5 pt-3 pb-6">
          <button
            type="button"
            onClick={clear}
            className="min-h-13 cursor-pointer rounded-2xl border border-slate-300 bg-white font-bold text-slate-900 hover:bg-slate-50"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={apply}
            className="min-h-13 cursor-pointer rounded-2xl border-none bg-amber-500 font-extrabold text-slate-950 hover:bg-amber-600"
          >
            Done
          </button>
        </div>
      </div>

      {/* Stacks on top of the Filters sheet; the draft above stays mounted. */}
      <PersonSearchSheet
        isOpen={pickingPerson}
        value={personId}
        onPick={(id, name) => {
          set({ person: id >= 0 ? String(id) : "" });
          setPersonName(id >= 0 ? name : null);
          setPickingPerson(false);
        }}
        onClose={() => setPickingPerson(false)}
      />
    </BottomSheet>
  );
};
