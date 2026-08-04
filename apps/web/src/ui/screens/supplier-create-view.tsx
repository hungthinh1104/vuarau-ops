"use client";

import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
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
    <div className="flex max-w-xl flex-col gap-4">
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
      <Button
        disabled={props.displayName.trim().length === 0 || props.command.phase.kind === "sending"}
        onClick={props.onCreate}
      >
        Tạo nhà cung cấp
      </Button>
      <CommandOutcome
        command={props.command}
        attemptedAction="Tạo nhà cung cấp"
        onReload={() => undefined}
      />
    </div>
  );
}
