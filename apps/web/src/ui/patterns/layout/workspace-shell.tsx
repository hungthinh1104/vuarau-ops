"use client";

import type { SessionDto } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { CloudAlert, CloudCheck, CloudUpload, LogOut, SwitchCamera } from "lucide-react";
import { usePathname } from "next/navigation";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { ThemeToggle } from "@/ui/components/theme-toggle.tsx";
import { AppNavView } from "./app-nav.tsx";
import { MobileNavView } from "./mobile-nav.tsx";
import { WORKSPACE_ROLE_COPY } from "@/ui/patterns/workspace/role-set-picker.tsx";

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
      <Button
        tone="secondary"
        onClick={() => void sync.onRetry()}
        className="touch-target inline-flex min-h-[36px] items-center gap-1.5 sm:gap-2 rounded-xl border border-warning/30 bg-warning-soft/80 px-2.5 sm:px-3 text-[11px] sm:text-[12px] font-semibold text-warning backdrop-blur-md shadow-sm"
        aria-label={`Cần xử lý ${sync.blockedCount} lệnh đồng bộ. Thử đồng bộ lại.`}
      >
        <CloudAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="sm:hidden">{sync.blockedCount}</span>
        <span className="hidden sm:inline whitespace-nowrap">Cần xử lý · {sync.blockedCount}</span>
      </Button>
    );
  }
  if (sync.queuedCount > 0) {
    return (
      <Button
        tone="secondary"
        onClick={() => void sync.onRetry()}
        className="touch-target inline-flex min-h-[36px] items-center gap-1.5 sm:gap-2 rounded-xl border border-offline/20 bg-offline-soft/80 px-2.5 sm:px-3 text-[11px] sm:text-[12px] font-semibold text-offline backdrop-blur-md shadow-sm"
        aria-label={`Có ${sync.queuedCount} lệnh chờ đồng bộ. Thử đồng bộ.`}
      >
        <CloudUpload aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="sm:hidden">{sync.queuedCount}</span>
        <span className="hidden sm:inline whitespace-nowrap">Chờ đồng bộ · {sync.queuedCount}</span>
      </Button>
    );
  }
  return (
    <span
      className="inline-flex min-h-[36px] items-center gap-1.5 sm:gap-2 rounded-xl border border-border bg-surface/50 backdrop-blur-md px-2.5 sm:px-3 text-[11px] sm:text-[12px] font-medium text-ink-muted shadow-sm ring-1 ring-ink/5"
      title={
        sync.lastSuccessfulSync === null
          ? "Chưa có giao dịch cần đồng bộ"
          : `Đồng bộ gần nhất ${new Date(sync.lastSuccessfulSync).toLocaleTimeString("vi-VN")}`
      }
    >
      <CloudCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-leaf" />
      <span className="hidden sm:inline whitespace-nowrap">
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
  return (
    <div className="min-h-screen bg-canvas pt-20 sm:pt-24 lg:pt-28 pb-32 lg:pb-12">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-button focus:bg-surface focus:px-4 focus:py-3 focus:text-label focus:font-semibold focus:text-ink"
      >
        Bỏ qua đến nội dung chính
      </a>

      {/* FLOATING TOP BAR */}
      <header className="fixed top-2 left-2 right-2 sm:top-4 sm:left-4 sm:right-4 lg:left-6 lg:right-6 z-40 mx-auto max-w-[1600px] pointer-events-none">
        <div className="pointer-events-auto h-14 sm:h-16 w-full flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 lg:px-5 rounded-[18px] sm:rounded-2xl border border-border bg-surface/70 backdrop-blur-2xl backdrop-saturate-150 shadow-sm ring-1 ring-ink/5">
          {/* Left: workspace identity */}
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3 pl-1">
            <span className="hidden h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl sm:rounded-[14px] bg-primary/10 dark:bg-primary/20 border border-primary/20 p-1.5 shadow-inner min-[400px]:flex">
              <img
                src="/icon/cauliflower-svgrepo-com.svg"
                alt="Vựa Rau Logo"
                className="h-full w-full object-contain"
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="hidden text-[10px] font-bold uppercase tracking-[0.1em] text-ink-muted/60 sm:block mb-0.5">
                Vựa đang làm việc
              </p>
              <p className="truncate text-[14px] font-bold text-ink sm:text-[15px] xl:text-[16px] leading-none">
                {workspaceName}
              </p>
            </div>
          </div>

          {/* Right: sync + user + actions */}
          <div className="flex shrink-0 items-center gap-2">
            {sync === undefined ? null : <SyncStatus sync={sync} />}

            <div className="hidden items-center gap-3 border-l border-ink-muted/20 pl-3 md:flex">
              {/* User info */}
              <div className="flex items-center gap-2.5">
                {/* Avatar */}
                <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-[10px] sm:rounded-[12px] bg-surface border border-border shadow-sm ring-1 ring-ink/5 text-[13px] sm:text-[14px] font-bold text-primary">
                  {userLabel.charAt(0).toUpperCase()}
                </div>
                <div className="max-w-24 lg:max-w-36">
                  <p
                    className="truncate text-[12px] lg:text-[13px] font-semibold text-ink leading-tight mb-1"
                    title={userLabel}
                  >
                    {userLabel}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {session.roles.map((role) => (
                      <Badge key={role} tone="info">
                        {WORKSPACE_ROLE_COPY[role]}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1 sm:gap-2">
              <ThemeToggle />
              {onChangeWorkspace === undefined ? null : (
                <Button
                  tone="secondary"
                  className="rounded-xl px-2 sm:px-2.5 h-9 sm:h-10 bg-surface/50 border-border shadow-sm ring-1 ring-ink/5 hover:bg-surface"
                  onClick={onChangeWorkspace}
                  title="Đổi vựa"
                  aria-label="Đổi vựa"
                >
                  <SwitchCamera aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
                  <span className="hidden xl:inline ml-1.5 text-[13px] font-semibold whitespace-nowrap">
                    Đổi vựa
                  </span>
                </Button>
              )}
              {onSignOut !== undefined ? (
                <Button
                  tone="secondary"
                  className="rounded-xl px-2 sm:px-2.5 h-9 sm:h-10 bg-surface/50 border-border shadow-sm ring-1 ring-ink/5 hover:bg-surface"
                  onClick={() => void onSignOut()}
                  title="Đăng xuất"
                  aria-label="Đăng xuất"
                >
                  <LogOut aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
                  <span className="hidden xl:inline ml-1.5 text-[13px] font-semibold whitespace-nowrap">
                    Đăng xuất
                  </span>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {/* FLOATING NOTICE */}
      {notice !== undefined ? (
        <div className="mx-auto max-w-[1600px] px-2 sm:px-4 lg:px-6 mb-6 mt-[-0.5rem] sm:mt-[-1rem]">
          <p className="rounded-[14px] sm:rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-center text-body-sm text-warning shadow-sm">
            {notice}
          </p>
        </div>
      ) : null}

      <div className="mx-auto flex max-w-[1600px] gap-6 xl:gap-8 px-4 lg:px-6">
        <AppNavView permissions={session.permissions} pathname={pathname} />
        <main id="main-content" className="min-w-0 flex-1">
          {children}
        </main>
      </div>

      <MobileNavView permissions={session.permissions} role={session.role} pathname={pathname} />
    </div>
  );
}
