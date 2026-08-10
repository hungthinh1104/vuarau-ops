"use client";

import type { SessionDto } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { CloudAlert, CloudUpload } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/ui/primitives/button.tsx";
import { AccountMenu } from "./account-menu.tsx";
import { AppNavView } from "./app-nav.tsx";
import { MobileNavView } from "./mobile-nav.tsx";
import { navigationFor, navigationItemIsActive } from "./pilot-navigation.ts";
import { WorkspaceChromeProvider } from "./workspace-chrome.tsx";
import { useLiveConnectionState } from "@/lib/live-connection.ts";

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

function LiveStatus() {
  const status = useLiveConnectionState();
  if (status === "live") return null;
  const message = status === "reconnecting" ? "Đang kết nối lại" : "Dữ liệu có thể chưa mới";
  return (
    <span
      className="hidden max-w-[13rem] truncate rounded-input border border-warning/30 bg-warning-soft px-2.5 py-2 text-caption font-semibold text-warning sm:inline"
      role="status"
    >
      {message}
    </span>
  );
}

function SyncStatus({ sync }: { readonly sync: NonNullable<WorkspaceShellProps["sync"]> }) {
  if (sync.blockedCount > 0) {
    return (
      <Button
        tone="secondary"
        onClick={() => void sync.onRetry()}
        className="min-h-11 max-w-[13rem] rounded-input border-warning/30 bg-warning-soft px-2.5 text-label font-semibold text-warning sm:px-3"
        aria-label={`Cần xử lý ${sync.blockedCount} lệnh đồng bộ. Thử đồng bộ lại.`}
      >
        <CloudAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="hidden truncate sm:inline">Cần xử lý · {sync.blockedCount}</span>
        <span className="tabular sm:hidden">{sync.blockedCount}</span>
      </Button>
    );
  }
  if (sync.queuedCount > 0) {
    return (
      <Button
        tone="secondary"
        onClick={() => void sync.onRetry()}
        className="min-h-11 max-w-[13rem] rounded-input border-offline/20 bg-offline-soft px-2.5 text-label font-semibold text-offline sm:px-3"
        aria-label={`Có ${sync.queuedCount} lệnh chờ đồng bộ. Thử đồng bộ.`}
      >
        <CloudUpload aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="hidden truncate sm:inline">Chờ đồng bộ · {sync.queuedCount}</span>
        <span className="tabular sm:hidden">{sync.queuedCount}</span>
      </Button>
    );
  }
  return null;
}

function currentLocationLabel(permissions: SessionDto["permissions"], pathname: string): string {
  const currentItem = navigationFor(permissions)
    .flatMap((group) => group.items)
    .find((item) => navigationItemIsActive(pathname, item));
  return currentItem?.label ?? "Hôm nay";
}

export function WorkspaceShell(props: WorkspaceShellProps) {
  return (
    <WorkspaceChromeProvider>
      <WorkspaceShellView {...props} pathname={usePathname() ?? ""} />
    </WorkspaceChromeProvider>
  );
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
  const currentLocation = currentLocationLabel(session.permissions, pathname);

  return (
    <div className="min-h-[100dvh] bg-canvas pb-24 lg:pb-8">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-button focus:bg-surface focus:px-4 focus:py-3 focus:text-label focus:font-semibold focus:text-ink"
      >
        Bỏ qua đến nội dung chính
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-[1680px] items-center gap-4 px-4 sm:px-6 xl:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-input bg-brand-soft p-1.5 min-[400px]:flex">
              <img
                src="/icon/cauliflower-svgrepo-com.svg"
                alt="Vựa Rau Logo"
                className="h-full w-full object-contain"
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="hidden text-caption font-semibold text-ink-muted sm:block">
                Vựa đang làm việc
              </p>
              <p className="truncate text-label font-semibold text-ink sm:text-body-sm">
                {workspaceName}
              </p>
            </div>
            <div className="hidden min-w-0 items-center gap-3 border-l border-border pl-4 xl:flex">
              <span className="text-caption text-ink-muted">Đang xem</span>
              <span className="truncate text-label font-semibold text-ink">{currentLocation}</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <LiveStatus />
            {sync === undefined ? null : <SyncStatus sync={sync} />}
            <AccountMenu
              session={session}
              userLabel={userLabel}
              onChangeWorkspace={onChangeWorkspace}
              onSignOut={onSignOut}
            />
          </div>
        </div>
      </header>

      {notice !== undefined ? (
        <div className="mx-auto max-w-[1680px] px-4 pt-4 sm:px-6 xl:px-8">
          <p className="rounded-input border border-warning/30 bg-warning-soft px-4 py-3 text-body-sm text-warning">
            {notice}
          </p>
        </div>
      ) : null}

      <div className="mx-auto flex max-w-[1680px] gap-6 px-4 pt-6 sm:px-6 lg:gap-8 lg:pt-8 xl:px-8">
        <AppNavView permissions={session.permissions} pathname={pathname} />
        <main id="main-content" className="min-w-0 flex-1">
          {children}
        </main>
      </div>

      <MobileNavView permissions={session.permissions} pathname={pathname} />
    </div>
  );
}
