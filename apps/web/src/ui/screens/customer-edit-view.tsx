"use client";

import type { CustomerDto } from "@vuarau/domain-contracts";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { CustomerFields } from "@/ui/patterns/customer/customer-fields.tsx";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { ActionDock } from "@/ui/patterns/layout/action-dock.tsx";
import { PageFrame, PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Button } from "@/ui/primitives/button.tsx";

export type CustomerEditViewProps = {
  readonly query: QueryLike<{ customer: CustomerDto }>;
  readonly displayName: string;
  readonly phone: string;
  readonly note: string;
  readonly loadedVersion: number | null;
  readonly duplicateCount: number;
  readonly command: CommandOutcomeView;
  readonly onDisplayName: (value: string) => void;
  readonly onPhone: (value: string) => void;
  readonly onNote: (value: string) => void;
  readonly onSave: () => void;
  readonly onRetry: () => void;
  readonly onCancel: () => void;
};

export function CustomerEditView(props: CustomerEditViewProps) {
  return (
    <QueryStates
      query={props.query}
      loadingLabel="Đang tải khách hàng"
      attemptedAction="Sửa khách hàng"
      onRetry={props.onRetry}
    >
      {() => (
        <PageFrame size="narrow">
          <div className="flex flex-col gap-5">
            <PageHeader
              title="Sửa khách hàng"
              back={{ href: `/customers/${props.query.data?.customer.id ?? ""}`, label: "Hủy" }}
            />
            <CustomerFields
              displayName={props.displayName}
              phone={props.phone}
              note={props.note}
              onDisplayName={props.onDisplayName}
              onPhone={props.onPhone}
              onNote={props.onNote}
            />
            {props.duplicateCount > 0 ? (
              <p className="rounded-card border border-warning/50 p-3 text-body-sm">
                Có {props.duplicateCount} hồ sơ trùng tên hoặc số điện thoại. Hệ thống không tự gộp.
              </p>
            ) : null}
            <ActionDock
              label="Hành động sửa khách hàng"
              summary={
                <p className="text-body-sm font-semibold text-ink">Kiểm tra trước khi lưu</p>
              }
              secondary={
                <Button tone="secondary" onClick={props.onCancel}>
                  Hủy
                </Button>
              }
              primary={
                <Button
                  disabled={
                    props.loadedVersion === null ||
                    props.displayName.trim().length === 0 ||
                    props.command.phase.kind === "sending"
                  }
                  onClick={props.onSave}
                >
                  {props.command.phase.kind === "sending" ? "Đang lưu…" : "Lưu thay đổi"}
                </Button>
              }
              feedback={
                <CommandOutcome
                  command={props.command}
                  attemptedAction="Sửa khách hàng"
                  onReload={props.onRetry}
                  onCancel={props.onCancel}
                />
              }
            />
          </div>
        </PageFrame>
      )}
    </QueryStates>
  );
}
