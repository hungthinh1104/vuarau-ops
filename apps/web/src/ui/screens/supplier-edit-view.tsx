"use client";

import type { SupplierDto } from "@vuarau/domain-contracts";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { PermissionDenied } from "@/ui/patterns/feedback/permission-denied.tsx";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { ActionDock } from "@/ui/patterns/layout/action-dock.tsx";
import { PageFrame, PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { TextInput } from "@/ui/primitives/text-input.tsx";
import { Textarea } from "@/ui/primitives/textarea.tsx";

export type SupplierEditViewProps = {
  readonly query: QueryLike<SupplierDto>;
  readonly canUpdate: boolean;
  readonly role: string;
  readonly displayName: string;
  readonly phone: string;
  readonly note: string;
  readonly lifecycleReason: string;
  readonly update: CommandOutcomeView;
  readonly lifecycle: CommandOutcomeView;
  readonly onDisplayName: (value: string) => void;
  readonly onPhone: (value: string) => void;
  readonly onNote: (value: string) => void;
  readonly onLifecycleReason: (value: string) => void;
  readonly onSave: () => void;
  readonly onLifecycle: () => void;
  readonly onRetry: () => void;
};

export function SupplierEditView(props: SupplierEditViewProps) {
  if (!props.canUpdate) {
    return (
      <PermissionDenied
        attemptedAction="Sửa nhà cung cấp"
        error={{
          code: "PERMISSION_DENIED",
          message: "Role does not carry supplier.update.",
          details: { permission: "supplier.update", role: props.role },
          retryable: false,
        }}
      />
    );
  }

  return (
    <QueryStates query={props.query} loadingLabel="Đang tải nhà cung cấp" onRetry={props.onRetry}>
      {(supplier) => (
        <PageFrame size="narrow">
          <div className="flex flex-col gap-4">
            <PageHeader
              title="Sửa nhà cung cấp"
              back={{ href: `/suppliers/${supplier.id}`, label: "Quay lại" }}
            />
            <TextInput
              label="Tên nhà cung cấp"
              value={props.displayName}
              onChange={(event) => props.onDisplayName(event.target.value)}
            />
            <TextInput
              label="Số điện thoại"
              value={props.phone}
              onChange={(event) => props.onPhone(event.target.value)}
              inputMode="tel"
            />
            <Textarea
              label="Ghi chú"
              value={props.note}
              onChange={(event) => props.onNote(event.target.value)}
            />
            <TextInput
              label="Lý do đổi trạng thái"
              value={props.lifecycleReason}
              onChange={(event) => props.onLifecycleReason(event.target.value)}
            />
            <ActionDock
              label="Hành động nhà cung cấp"
              summary={
                <p className="text-body-sm font-semibold text-ink">Kiểm tra trước khi lưu</p>
              }
              secondary={
                <Button
                  tone="secondary"
                  disabled={
                    props.lifecycleReason.trim().length === 0 ||
                    props.lifecycle.phase.kind === "sending"
                  }
                  onClick={props.onLifecycle}
                >
                  {supplier.isActive ? "Ngưng nhà cung cấp" : "Kích hoạt lại"}
                </Button>
              }
              primary={
                <Button
                  disabled={
                    props.displayName.trim().length === 0 || props.update.phase.kind === "sending"
                  }
                  onClick={props.onSave}
                >
                  {props.update.phase.kind === "sending" ? "Đang lưu…" : "Lưu thay đổi"}
                </Button>
              }
              feedback={
                <>
                  <CommandOutcome
                    command={props.update}
                    attemptedAction="Sửa nhà cung cấp"
                    onReload={props.onRetry}
                  />
                  <CommandOutcome
                    command={props.lifecycle}
                    attemptedAction="Đổi trạng thái nhà cung cấp"
                    onReload={props.onRetry}
                  />
                </>
              }
            />
          </div>
        </PageFrame>
      )}
    </QueryStates>
  );
}
