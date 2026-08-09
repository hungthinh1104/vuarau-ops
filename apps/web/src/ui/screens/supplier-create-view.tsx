"use client";

import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { ActionDock } from "@/ui/patterns/layout/action-dock.tsx";
import { PageFrame, PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { TextInput } from "@/ui/primitives/text-input.tsx";
import { Textarea } from "@/ui/primitives/textarea.tsx";

export type SupplierCreateViewProps = {
  readonly displayName: string;
  readonly phone: string;
  readonly note: string;
  readonly command: CommandOutcomeView;
  readonly onDisplayName: (value: string) => void;
  readonly onPhone: (value: string) => void;
  readonly onNote: (value: string) => void;
  readonly onCreate: () => void;
};

export function SupplierCreateView(props: SupplierCreateViewProps) {
  return (
    <PageFrame size="narrow">
      <div className="flex flex-col gap-4">
        <PageHeader title="Thêm nhà cung cấp" back={{ href: "/suppliers", label: "Hủy" }} />
        <TextInput
          label="Tên nhà cung cấp"
          value={props.displayName}
          onChange={(event) => props.onDisplayName(event.target.value)}
          autoFocus
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
        <ActionDock
          label="Hành động nhà cung cấp"
          summary={
            <p className="text-body-sm font-semibold text-ink">Kiểm tra thông tin trước khi tạo</p>
          }
          primary={
            <Button
              disabled={
                props.displayName.trim().length === 0 || props.command.phase.kind === "sending"
              }
              onClick={props.onCreate}
            >
              {props.command.phase.kind === "sending" ? "Đang tạo…" : "Tạo nhà cung cấp"}
            </Button>
          }
          feedback={
            <CommandOutcome
              command={props.command}
              attemptedAction="Tạo nhà cung cấp"
              onReload={() => undefined}
            />
          }
        />
      </div>
    </PageFrame>
  );
}
