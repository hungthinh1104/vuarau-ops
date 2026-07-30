import type { DomainError, Permission, WorkspaceRole } from "@vuarau/domain-contracts";
import { messageForCode } from "@/ui/copy.ts";

export type PermissionDeniedProps = {
  readonly error: DomainError;
  /** What the user was trying to do, in their words. "Hoàn tác đơn hàng". */
  readonly attemptedAction: string;
};

/**
 * The honest fallback for when authorization changed between the read and the tap.
 *
 * Ideally nobody reaches this: `capabilities` says in advance whether a control
 * should be enabled, and `session.me` says whether the menu item should exist. But
 * a role can change mid-shift — that is exactly what happens when somebody's
 * access is narrowed while they are working — and the button they are looking at
 * was rendered before it happened.
 *
 * Distinct from a business rejection because the **remedy is a person**: "ask the
 * owner", not "try again". Naming the missing permission and the role makes that
 * request answerable; "không có quyền" alone makes it an argument.
 */
export function PermissionDenied({ error, attemptedAction }: PermissionDeniedProps) {
  const permission = readDetail(error, "permission");
  const role = readDetail(error, "role");

  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-card border border-warning/40 bg-warning-soft px-4 py-3"
    >
      <p className="text-label font-semibold text-warning">Không đủ quyền</p>
      <p className="text-body-sm text-ink">
        {attemptedAction} cần quyền mà tài khoản của bạn chưa có.
      </p>

      {permission !== null || role !== null ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-caption text-ink-muted">
          {role !== null ? (
            <>
              <dt>Vai trò của bạn</dt>
              <dd>{roleCopy(role)}</dd>
            </>
          ) : null}
          {permission !== null ? (
            <>
              <dt>Quyền cần có</dt>
              <dd className="font-mono">{permission}</dd>
            </>
          ) : null}
        </dl>
      ) : null}

      <p className="text-body-sm text-ink">{messageForCode(error.code, error.message)}</p>
    </div>
  );
}

/** `details` is `Record<string, unknown>`; reading it is narrowing, not casting. */
function readDetail(error: DomainError, key: string): string | null {
  const value = error.details?.[key];
  return typeof value === "string" ? value : null;
}

const ROLE_COPY: Readonly<Record<WorkspaceRole, string>> = {
  owner: "Chủ vựa",
  accountant: "Kế toán",
  sales: "Bán hàng",
  warehouse: "Kho",
  delivery: "Giao hàng",
};

function roleCopy(role: string): string {
  return ROLE_COPY[role as WorkspaceRole] ?? role;
}

export type PermissionHint = {
  readonly permission: Permission;
  readonly role: WorkspaceRole;
};
