"use client";

import type { SessionDto, WorkspaceRole } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import {
  CloudAlert,
  CloudCheck,
  CloudUpload,
  LogOut,
  Settings2,
  ShoppingCart,
  Store,
  SwitchCamera,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOffline } from "@/offline/provider.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { AppNavView } from "./app-nav.tsx";
import { MobileNavView } from "./mobile-nav.tsx";

const ROLE_COPY: Readonly<Record<WorkspaceRole, string>> = {
  owner: "Chủ vựa",
  accountant: "Kế toán",
  sales: "Bán hàng",
  warehouse: "Kho",
  delivery: "Giao hàng",
};

export type WorkspaceShellProps = {
  readonly workspaceName: string;
  readonly session: SessionDto;
  readonly userLabel: string;
  readonly notice?: string;
  readonly onChangeWorkspace?: () => void;
  readonly onSignOut?: () => void | Promise<void>;
  readonly sync?: {
    readonly queuedCount: number;
    readonly blockedCount: number;
    readonly lastSuccessfulSync: string | null;
    readonly onRetry: () => Promise<void>;
  };
  readonly children: ReactNode;
};

function SyncStatus({ sync }: { readonly sync: NonNullable<WorkspaceShellProps["sync"]> }) {
  if (sync.blockedCount > 0) {
    return (
      <button
        type="button"
        onClick={() => void sync.onRetry()}
        className="touch-target inline-flex min-h-10 items-center gap-2 rounded-pill border border-warning/30 bg-warning-soft px-3 text-caption font-semibold text-warning"
        aria-label={`Cần xử lý ${sync.blockedCount} lệnh đồng bộ. Thử đồng bộ lại.`}
      >
        <CloudAlert aria-hidden="true" className="h-4 w-4" />
        <span className="sm:hidden">{sync.blockedCount}</span>
        <span className="hidden sm:inline">Cần xử lý · {sync.blockedCount}</span>
      </button>
    );
  }
  if (sync.queuedCount > 0) {
    return (
      <button
        type="button"
        onClick={() => void sync.onRetry()}
        className="touch-target inline-flex min-h-10 items-center gap-2 rounded-pill border border-offline/25 bg-offline-soft px-3 text-caption font-semibold text-offline"
        aria-label={`Có ${sync.queuedCount} lệnh chờ đồng bộ. Thử đồng bộ.`}
      >
        <CloudUpload aria-hidden="true" className="h-4 w-4" />
        <span className="sm:hidden">{sync.queuedCount}</span>
        <span className="hidden sm:inline">Chờ đồng bộ · {sync.queuedCount}</span>
      </button>
    );
  }
  return (
    <span
      className="inline-flex min-h-10 items-center gap-2 rounded-pill border border-border bg-surface-muted px-3 text-caption font-medium text-ink-muted"
      title={
        sync.lastSuccessfulSync === null
          ? "Chưa có giao dịch cần đồng bộ"
          : `Đồng bộ gần nhất ${new Date(sync.lastSuccessfulSync).toLocaleTimeString("vi-VN")}`
      }
    >
      <CloudCheck aria-hidden="true" className="h-4 w-4 text-leaf" />
      <span className="hidden sm:inline">
        {sync.lastSuccessfulSync === null ? "Sẵn sàng" : "Đã đồng bộ"}
      </span>
    </span>
  );
}

export function WorkspaceShell(props: WorkspaceShellProps) {
  return <WorkspaceShellView {...props} pathname={usePathname() ?? ""} />;
}

export function WorkspaceShellView({
  workspaceName,
  session,
  userLabel,
  notice,
  onChangeWorkspace,
  onSignOut,
  sync,
  children,
  pathname,
}: WorkspaceShellProps & { readonly pathname: string }) {
  const isQuickSaleRoute =
    pathname === "/sales/new" || /^\/customers\/[^/]+\/sales\/new$/.test(pathname);

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 h-16 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between gap-3 px-4 py-2 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-card bg-leaf-soft text-leaf sm:flex">
              <Store aria-hidden="true" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="hidden text-caption font-medium text-ink-muted sm:block">
                Vựa đang làm việc
              </p>
              <p className="truncate text-body font-semibold text-ink sm:text-subheading">
                {workspaceName}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {sync === undefined ? null : <SyncStatus sync={sync} />}
            <div className="hidden items-center gap-2 border-l border-border pl-2 md:flex">
              <div className="max-w-44 text-right">
                <p className="truncate text-body-sm font-medium text-ink" title={userLabel}>
                  {userLabel}
                </p>
              </div>
              <Badge tone="info">{ROLE_COPY[session.role]}</Badge>
            </div>
            {onChangeWorkspace === undefined ? null : (
              <Button
                tone="secondary"
                className="px-3"
                onClick={onChangeWorkspace}
                title="Đổi vựa"
                aria-label="Đổi vựa"
              >
                <SwitchCamera aria-hidden="true" className="h-4 w-4" />
                <span className="hidden xl:inline">Đổi vựa</span>
              </Button>
            )}
            {onSignOut !== undefined ? (
              <Button
                tone="secondary"
                className="px-3"
                onClick={() => void onSignOut()}
                title="Đăng xuất"
                aria-label="Đăng xuất"
              >
                <LogOut aria-hidden="true" className="h-4 w-4" />
                <span className="hidden xl:inline">Đăng xuất</span>
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      {!isQuickSaleRoute &&
      (session.permissions.includes("sale.create") ||
        session.permissions.includes("workspace.manage")) ? (
        <div className="border-b border-border bg-surface px-4 py-2 lg:hidden">
          <div className="mx-auto flex max-w-xl gap-2">
            {session.permissions.includes("sale.create") ? (
              <Link
                href="/sales/new"
                className="touch-target flex flex-1 items-center justify-center gap-2 rounded-button bg-leaf px-3 text-label font-semibold text-white"
              >
                <ShoppingCart aria-hidden="true" className="h-4 w-4" />
                Ghi đơn nhanh
              </Link>
            ) : null}
            {session.permissions.includes("workspace.manage") ? (
              <Link
                href="/workspace/operations"
                className="touch-target flex flex-1 items-center justify-center gap-2 rounded-button border border-border bg-surface px-3 text-label font-semibold text-ink"
              >
                <Settings2 aria-hidden="true" className="h-4 w-4" />
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

      <div className="mx-auto flex max-w-[1440px] gap-6 px-4 lg:px-8">
        <AppNavView permissions={session.permissions} pathname={pathname} />
        <main className="min-w-0 flex-1 py-6 pb-24 lg:pb-10">{children}</main>
      </div>
      <MobileNavView permissions={session.permissions} pathname={pathname} />
    </div>
  );
}

export function ConnectedWorkspaceShell(props: Omit<WorkspaceShellProps, "sync">) {
  const offline = useOffline();
  return (
    <WorkspaceShell
      {...props}
      sync={{
        queuedCount: offline.queuedCount,
        blockedCount: offline.blockedCount,
        lastSuccessfulSync: offline.lastSuccessfulSync,
        onRetry: offline.retry,
      }}
    />
  );
}
