"use client";

import { useRouter } from "next/navigation";
import type React from "react";
import { useState, useTransition } from "react";
import { toast } from "@/components/ui/Toast";
import {
  AdminFormSheet,
  AdminHeader,
  AdminListControls,
  AdminRow,
  EmptyList,
} from "@/features/admin/AdminUi";
import {
  normalizeMobile,
  RoleBadge,
  type UserDraft,
  UserFields,
  validateUserDraft,
} from "@/features/admin/UserForm";
import { formatTimestamp } from "@/lib/format";
import { createUserAction } from "@/server/actions/admin";
import type { AdminUser } from "@/server/queries/admin";

const EMPTY_DRAFT: UserDraft = {
  name: "",
  mobile: "",
  password: "",
  role: "regular",
};

export const AdminUsersClient: React.FC<{
  users: AdminUser[];
  status: string;
  sort: string;
  q: string;
}> = ({ users, status, sort, q }) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<UserDraft | null>(null);

  const create = () => {
    if (!draft) return;
    const error = validateUserDraft(draft, { passwordRequired: true });
    if (error) return toast(error);

    startTransition(async () => {
      const res = await createUserAction({
        name: draft.name.trim(),
        mobile: normalizeMobile(draft.mobile),
        password: draft.password,
        role: draft.role,
      });
      if (res.ok) {
        toast("User created");
        setDraft(null);
        router.refresh();
      } else {
        toast(res.error || "Failed to create user");
      }
    });
  };

  return (
    <div className="space-y-3 px-4 pb-28 pt-4 md:px-6 md:pt-6 lg:px-8">
      <AdminHeader
        title="Users"
        subtitle={`${users.length} shown`}
        addLabel="Add user"
        onAdd={() => setDraft(EMPTY_DRAFT)}
      />
      <AdminListControls
        status={status}
        sort={sort}
        q={q}
        searchPlaceholder="Search name or mobile"
      />

      {users.length === 0 ? (
        <EmptyList status={status} noun="users" />
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {users.map((u) => (
            <li key={u.id}>
              <AdminRow
                href={`/admin/users/${u.id}`}
                title={u.name}
                subtitle={`+91 ${u.mobile} · ${u.lastLoginAt ? `Last login ${formatTimestamp(u.lastLoginAt)}` : "Never signed in"}`}
                badge={<RoleBadge role={u.role} />}
                active={u.active}
              />
            </li>
          ))}
        </ul>
      )}

      <AdminFormSheet
        isOpen={draft !== null}
        title="Add user"
        onClose={() => setDraft(null)}
        onSubmit={create}
        isPending={isPending}
        submitLabel="Create user"
      >
        {draft && (
          <UserFields draft={draft} onChange={setDraft} isEditing={false} />
        )}
      </AdminFormSheet>
    </div>
  );
};
