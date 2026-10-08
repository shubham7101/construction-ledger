"use client";

import { useRouter } from "next/navigation";
import type React from "react";
import { useState, useTransition } from "react";
import { Segmented } from "@/components/ui/Segmented";
import { SiteStatusBadge } from "@/components/ui/SiteStatusBadge";
import { toast } from "@/components/ui/Toast";
import {
  AdminFormSheet,
  AdminHeader,
  AdminListControls,
  AdminRow,
  EmptyList,
  INPUT_CLASS,
} from "@/features/admin/AdminUi";
import { invalidateReferenceOptions } from "@/lib/reference-cache";
import {
  createSiteAction,
  setSiteActiveAction,
  updateSiteAction,
} from "@/server/actions/admin";
import type { AdminSite } from "@/server/queries/admin";

type Status = "active" | "completed" | "on_hold";

type Draft = {
  id?: number;
  name: string;
  address: string;
  city: string;
  state: string;
  status: Status;
  active: boolean;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  address: "",
  city: "",
  state: "",
  status: "active",
  active: true,
};

const STATUS_OPTIONS = [
  ["active", "Active"],
  ["completed", "Completed"],
  ["on_hold", "On hold"],
] as const;

export const AdminSitesClient: React.FC<{
  sites: AdminSite[];
  status: string;
  sort: string;
  q: string;
}> = ({ sites, status, sort, q }) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);

  const finish = (res: { ok: boolean; error?: string }, message: string) => {
    if (!res.ok) {
      toast(res.error || "Something went wrong");
      return;
    }
    invalidateReferenceOptions(); // pickers cache the site list per session
    toast(message);
    setDraft(null);
    router.refresh();
  };

  const save = () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return toast("Please enter a site name");
    const input = {
      name,
      address: draft.address.trim(),
      city: draft.city.trim(),
      state: draft.state.trim(),
      status: draft.status,
    };
    startTransition(async () => {
      const res =
        draft.id === undefined
          ? await createSiteAction(input)
          : await updateSiteAction(draft.id, input);
      finish(res, draft.id === undefined ? "Site created" : "Site updated");
    });
  };

  const toggleActive = () => {
    if (draft?.id === undefined) return;
    const { id, active } = draft;
    startTransition(async () => {
      finish(
        await setSiteActiveAction(id, !active),
        active ? "Site deactivated" : "Site reactivated",
      );
    });
  };

  return (
    <div className="space-y-3 px-4 pb-28 pt-4 md:px-6 md:pt-6 lg:px-8">
      <AdminHeader
        title="Sites"
        subtitle={`${sites.length} shown`}
        addLabel="Add site"
        onAdd={() => setDraft(EMPTY_DRAFT)}
      />
      <AdminListControls
        status={status}
        sort={sort}
        q={q}
        searchPlaceholder="Search name or city"
      />

      {sites.length === 0 ? (
        <EmptyList status={status} noun="sites" />
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {sites.map((s) => (
            <li key={s.id}>
              <AdminRow
                title={s.name}
                subtitle={
                  [s.city, s.state].filter(Boolean).join(", ") || "No city"
                }
                badge={<SiteStatusBadge status={s.status} />}
                active={s.active}
                onClick={() =>
                  setDraft({
                    id: s.id,
                    name: s.name,
                    address: s.address,
                    city: s.city,
                    state: s.state,
                    status: s.status,
                    active: s.active,
                  })
                }
              />
            </li>
          ))}
        </ul>
      )}

      <AdminFormSheet
        isOpen={draft !== null}
        title={draft?.id === undefined ? "Add site" : "Edit site"}
        onClose={() => setDraft(null)}
        onSubmit={save}
        isPending={isPending}
        submitLabel={draft?.id === undefined ? "Create site" : "Save changes"}
        activeToggle={
          draft?.id !== undefined
            ? { active: draft.active, onToggle: toggleActive }
            : undefined
        }
      >
        {draft && (
          <>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Site / project name"
              aria-label="Site name"
              className={INPUT_CLASS}
            />
            <input
              value={draft.address}
              onChange={(e) => setDraft({ ...draft, address: e.target.value })}
              placeholder="Address (optional)"
              aria-label="Address"
              className={INPUT_CLASS}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={draft.city}
                onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                placeholder="City"
                aria-label="City"
                className={INPUT_CLASS}
              />
              <input
                value={draft.state}
                onChange={(e) => setDraft({ ...draft, state: e.target.value })}
                placeholder="State"
                aria-label="State"
                className={INPUT_CLASS}
              />
            </div>
            <Segmented<Status>
              ariaLabel="Project status"
              options={STATUS_OPTIONS}
              value={draft.status}
              onChange={(status) => setDraft({ ...draft, status })}
            />
          </>
        )}
      </AdminFormSheet>
    </div>
  );
};
