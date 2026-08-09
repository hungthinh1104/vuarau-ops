"use client";

import { useState } from "react";
import { ChevronDown, LogOut, SwitchCamera } from "lucide-react";
import type { SessionDto } from "@vuarau/domain-contracts";
import { ThemeToggle } from "@/ui/components/theme-toggle.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { Sheet } from "@/ui/primitives/sheet.tsx";
import { WORKSPACE_ROLE_COPY } from "@/ui/patterns/workspace/role-set-picker.tsx";

export function AccountMenu({
  session,
  userLabel,
  onChangeWorkspace,
  onSignOut,
}: {
  readonly session: SessionDto;
  readonly userLabel: string;
  readonly onChangeWorkspace?: (() => void) | undefined;
  readonly onSignOut?: (() => void | Promise<void>) | undefined;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        tone="secondary"
        onClick={() => setOpen(true)}
        aria-label="Mở tài khoản"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="min-h-11 max-w-[15rem] rounded-input px-2 sm:px-3"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-input bg-brand-soft text-caption font-bold text-primary">
          {userLabel.charAt(0).toUpperCase() || "?"}
        </span>
        <span className="hidden max-w-[10rem] truncate text-left sm:inline">{userLabel}</span>
        <ChevronDown
          aria-hidden="true"
          className="hidden h-4 w-4 shrink-0 text-ink-muted sm:inline"
        />
      </Button>
      <Sheet open={open} title="Tài khoản" onClose={() => setOpen(false)}>
        <div className="grid gap-5">
          <div className="flex items-start gap-3 border-b border-border pb-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-brand-soft text-label font-semibold text-brand">
              {userLabel.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{userLabel}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {session.roles.map((role) => (
                  <span key={role} className="text-caption text-ink-muted">
                    {WORKSPACE_ROLE_COPY[role]}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Giao diện</p>
              <p className="text-body-sm text-ink-muted">Chọn sáng hoặc tối cho thiết bị này.</p>
            </div>
            <ThemeToggle />
          </div>
          {onChangeWorkspace === undefined ? null : (
            <Button
              tone="secondary"
              fullWidth
              onClick={() => {
                setOpen(false);
                onChangeWorkspace();
              }}
            >
              <SwitchCamera aria-hidden="true" className="mr-2 inline-block h-4 w-4" />
              Đổi vựa
            </Button>
          )}
          {onSignOut === undefined ? null : (
            <Button
              tone="danger"
              fullWidth
              onClick={() => {
                setOpen(false);
                void onSignOut();
              }}
            >
              <LogOut aria-hidden="true" className="mr-2 inline-block h-4 w-4" />
              Đăng xuất
            </Button>
          )}
        </div>
      </Sheet>
    </>
  );
}
