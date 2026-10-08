"use client";

import { useRouter } from "next/navigation";
import type React from "react";
import { useState, useTransition } from "react";
import { Segmented } from "@/components/ui/Segmented";
import { toast } from "@/components/ui/Toast";
import {
  AdminFormSheet,
  AdminHeader,
  AdminListControls,
  AdminRow,
  EmptyList,
  INPUT_CLASS,
} from "@/features/admin/AdminUi";
import { useUrlParams } from "@/hooks/useUrlParams";
import { invalidateReferenceOptions } from "@/lib/reference-cache";
import {
  createCategoryAction,
  createPersonTypeAction,
  setCategoryActiveAction,
  setPersonTypeActiveAction,
  updateCategoryAction,
  updatePersonTypeAction,
} from "@/server/actions/admin";
import type { MasterItem, MasterKind } from "@/server/queries/admin";

/** Per-tab wording and actions; both tabs share one screen. */
const KINDS = {
  categories: {
    noun: "category",
    plural: "categories",
    placeholder: "Category name (e.g. Plumbing)",
    create: createCategoryAction,
    update: updateCategoryAction,
    setActive: setCategoryActiveAction,
  },
  personTypes: {
    noun: "person type",
    plural: "person types",
    placeholder: "Person type (e.g. Plumber)",
    create: createPersonTypeAction,
    update: updatePersonTypeAction,
    setActive: setPersonTypeActiveAction,
  },
} as const;

const TABS = [
  ["categories", "Categories"],
  ["personTypes", "Person types"],
] as const;

type Draft = { id?: number; name: string; active: boolean };

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const AdminCategoriesClient: React.FC<{
  kind: MasterKind;
  items: MasterItem[];
  status: string;
  sort: string;
  q: string;
}> = ({ kind, items, status, sort, q }) => {
  const router = useRouter();
  const { update } = useUrlParams();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const k = KINDS[kind];

  const finish = (res: { ok: boolean; error?: string }, message: string) => {
    if (!res.ok) {
      toast(res.error || "Something went wrong");
      return;
    }
    invalidateReferenceOptions(); // pickers cache these lists per session
    toast(message);
    setDraft(null);
    router.refresh();
  };

  const save = () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return toast(`Please enter a ${k.noun} name`);
    startTransition(async () => {
      const res =
        draft.id === undefined
          ? await k.create({ name })
          : await k.update(draft.id, { name });
      finish(
        res,
        `${capitalize(k.noun)} ${draft.id === undefined ? "created" : "updated"}`,
      );
    });
  };

  const toggleActive = () => {
    if (draft?.id === undefined) return;
    const { id, active } = draft;
    startTransition(async () => {
      finish(
        await k.setActive(id, !active),
        `${capitalize(k.noun)} ${active ? "deactivated" : "reactivated"}`,
      );
    });
  };

  return (
    <div className="space-y-3 px-4 pb-28 pt-4 md:px-6 md:pt-6 lg:px-8">
      <AdminHeader
        title="Categories Master"
        subtitle={`${items.length} ${k.plural} shown`}
        addLabel={`Add ${k.noun}`}
        onAdd={() => setDraft({ name: "", active: true })}
      />

      <Segmented<MasterKind>
        ariaLabel="List"
        options={TABS}
        value={kind}
        onChange={(next) =>
          update({ tab: next === "personTypes" ? "types" : undefined })
        }
      />

      <AdminListControls
        status={status}
        sort={sort}
        q={q}
        searchPlaceholder={`Search ${k.plural}`}
      />

      {items.length === 0 ? (
        <EmptyList status={status} noun={k.plural} />
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <li key={item.id}>
              <AdminRow
                title={item.name}
                active={item.active}
                onClick={() =>
                  setDraft({
                    id: item.id,
                    name: item.name,
                    active: item.active,
                  })
                }
              />
            </li>
          ))}
        </ul>
      )}

      <AdminFormSheet
        isOpen={draft !== null}
        title={`${draft?.id === undefined ? "Add" : "Edit"} ${k.noun}`}
        onClose={() => setDraft(null)}
        onSubmit={save}
        isPending={isPending}
        submitLabel={draft?.id === undefined ? "Create" : "Save changes"}
        activeToggle={
          draft?.id !== undefined
            ? { active: draft.active, onToggle: toggleActive }
            : undefined
        }
      >
        {draft && (
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder={k.placeholder}
            aria-label={`${capitalize(k.noun)} name`}
            className={INPUT_CLASS}
          />
        )}
      </AdminFormSheet>
    </div>
  );
};
