import type { SessionDto, WorkspaceRole } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { AppNav } from "./app-nav.tsx";
import { MobileNav } from "./mobile-nav.tsx";

const ROLE_COPY: Readonly<Record<WorkspaceRole, string>> = {
  owner: "Chủ vựa",
  accountant: "Kế toán",
  sales: "Bán hàng",
  warehouse: "Kho",
  delivery: "Giao hàng",
};

export type WorkspaceShellProps = {
  /** Named, never inferred. See the note below on why. */
  readonly workspaceName: string;
  readonly session: SessionDto;
  readonly userLabel: string;
  /** A standing message about the page itself, not about a command. */
  readonly notice?: string;
  readonly onChangeWorkspace?: () => void;
  readonly onSignOut?: () => void | Promise<void>;
  readonly children: ReactNode;
};

/**
 * The frame every screen sits in: which depot, who you are, what you are.
 *
 * The workspace name is always visible, and that is a product decision rather
 * than a layout one. Every command and every read is scoped by `workspaceId`
 * (BR-CUSTOMER-002), so somebody who keeps two depots must be able to see, at a
 * glance, which set of books they are writing into. A header that only shows it on
 * a settings page is a header that lets a sale land in the wrong depot.
 *
 * Mobile-first: one column, 16px padding, content max-width for the desk. The
 * desktop sidebar and mobile navigation expose only destinations backed by the
 * current session's server-authored capabilities.
 */
export function WorkspaceShell({
  workspaceName,
  session,
  userLabel,
  notice,
  onChangeWorkspace,
  onSignOut,
  children,
}: WorkspaceShellProps) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 py-3 lg:px-8">
          <div>
            <p className="text-caption text-ink-muted">Đang ghi vào</p>
            <p className="text-subheading font-semibold text-ink">{workspaceName}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="max-w-48 truncate text-body-sm text-ink-muted" title={userLabel}>
              {userLabel}
            </span>
            <Badge tone="info">{ROLE_COPY[session.role]}</Badge>
            {onChangeWorkspace === undefined ? null : (
              <Button tone="secondary" onClick={onChangeWorkspace}>
                Đổi vựa
              </Button>
            )}
            {onSignOut !== undefined ? (
              <Button tone="secondary" onClick={() => void onSignOut()}>
                Đăng xuất
              </Button>
            ) : null}
          </div>
        </div>
      </header>
      {session.permissions.includes("sale.create") ||
      session.permissions.includes("workspace.manage") ? (
        <div className="border-b border-border bg-surface px-4 py-2 lg:hidden">
          <div className="mx-auto flex max-w-xl gap-2">
            {session.permissions.includes("sale.create") ? (
              <Link
                href="/sales/new"
                className="touch-target flex flex-1 items-center justify-center rounded-button bg-leaf px-3 text-label font-semibold text-white"
              >
                Ghi đơn nhanh
              </Link>
            ) : null}
            {session.permissions.includes("workspace.manage") ? (
              <Link
                href="/workspace/operations"
                className="touch-target flex flex-1 items-center justify-center rounded-button border border-border bg-surface px-3 text-label font-semibold text-ink"
              >
                Vận hành
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {notice !== undefined ? (
        <p className="border-b border-warning/30 bg-warning-soft px-4 py-2 text-center text-body-sm text-warning lg:px-8">
          {notice}
        </p>
      ) : null}

      <div className="mx-auto flex max-w-[1440px] gap-8 px-4 lg:px-8">
        <AppNav permissions={session.permissions} />
        <main className="min-w-0 flex-1 py-6 pb-24 lg:pb-8">{children}</main>
      </div>
      <MobileNav permissions={session.permissions} />
    </div>
  );
}
