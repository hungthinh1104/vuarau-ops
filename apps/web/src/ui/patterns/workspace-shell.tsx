import type { SessionDto, WorkspaceRole } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { Badge } from "../primitives/badge.tsx";

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
  /** A standing message about the page itself, not about a command. */
  readonly notice?: string;
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
 * Mobile-first: one column, 16px padding, content max-width for the desk. There is
 * no sidebar yet because there is nothing to navigate to — design.md's web
 * navigation arrives with the screens it points at, not before them.
 */
export function WorkspaceShell({ workspaceName, session, notice, children }: WorkspaceShellProps) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 py-3 lg:px-8">
          <div>
            <p className="text-caption text-ink-muted">Đang ghi vào</p>
            <p className="text-subheading font-semibold text-ink">{workspaceName}</p>
          </div>
          <Badge tone="info">{ROLE_COPY[session.role]}</Badge>
        </div>
      </header>

      {notice !== undefined ? (
        <p className="border-b border-warning/30 bg-warning-soft px-4 py-2 text-center text-body-sm text-warning lg:px-8">
          {notice}
        </p>
      ) : null}

      <main className="mx-auto max-w-[1440px] px-4 py-6 lg:px-8">{children}</main>
    </div>
  );
}
