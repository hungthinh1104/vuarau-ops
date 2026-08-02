"use client";

import type { CustomerDto } from "@vuarau/domain-contracts";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { CustomerFields } from "@/ui/patterns/customer/customer-fields.tsx";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
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
        <div className="flex max-w-2xl flex-col gap-5">
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
          <Button
            disabled={
              props.loadedVersion === null ||
              props.displayName.trim().length === 0 ||
              props.command.phase.kind === "sending"
            }
            onClick={props.onSave}
          >
            Lưu thay đổi
          </Button>
          <CommandOutcome
            command={props.command}
            attemptedAction="Sửa khách hàng"
            onReload={props.onRetry}
            onCancel={props.onCancel}
          />
        </div>
      )}
    </QueryStates>
  );
}
