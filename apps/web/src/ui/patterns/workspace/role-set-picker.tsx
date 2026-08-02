"use client";

import type { WorkspaceRole } from "@vuarau/domain-contracts";
import { WORKSPACE_ROLES, normalizeWorkspaceRoles } from "@vuarau/domain-contracts";
import { Checkbox } from "@/ui/primitives/checkbox.tsx";

export const WORKSPACE_ROLE_COPY: Readonly<Record<WorkspaceRole, string>> = {
  owner: "Chủ vựa",
  accountant: "Kế toán",
  sales: "Bán hàng",
  warehouse: "Kho",
  delivery: "Giao hàng",
};

export function nextWorkspaceRoles(
  current: readonly WorkspaceRole[],
  toggled: WorkspaceRole,
): readonly WorkspaceRole[] {
  const normalized = normalizeWorkspaceRoles(current);
  if (toggled === "owner") return normalized.includes("owner") ? normalized : ["owner"];

  const withoutOwner = normalized.filter((role) => role !== "owner");
  const next = withoutOwner.includes(toggled)
    ? withoutOwner.filter((role) => role !== toggled)
    : [...withoutOwner, toggled];
  return next.length === 0 ? normalized : normalizeWorkspaceRoles(next);
}

export function RoleSetPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: readonly WorkspaceRole[];
  onChange: (roles: readonly WorkspaceRole[]) => void;
  disabled?: boolean;
}) {
  const normalized = normalizeWorkspaceRoles(value);
  return (
    <fieldset className="rounded-card border border-border p-3" disabled={disabled}>
      <legend className="px-1 text-label font-semibold">Vai trò</legend>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {WORKSPACE_ROLES.map((role) => {
          const checked = normalized.includes(role);
          return (
            <label key={role} className="flex min-h-11 items-center gap-2 text-label">
              <Checkbox
                checked={checked}
                disabled={disabled || (checked && normalized.length === 1)}
                onChange={() => onChange(nextWorkspaceRoles(normalized, role))}
              />
              {WORKSPACE_ROLE_COPY[role]}
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-caption text-ink-muted">
        Quyền là hợp của các vai trò. Chủ vựa là vai trò độc quyền và không đi kèm vai trò khác.
      </p>
    </fieldset>
  );
}
