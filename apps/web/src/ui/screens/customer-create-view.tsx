"use client";

import Link from "next/link";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { CustomerFields } from "@/ui/patterns/customer/customer-fields.tsx";
import { ActionDock } from "@/ui/patterns/layout/action-dock.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Button } from "@/ui/primitives/button.tsx";

export type CustomerDuplicateCandidate = {
  readonly customer: {
    readonly id: string;
    readonly displayName: string;
    readonly phone: string | null;
  };
  readonly reasons: readonly ("same_name" | "same_phone")[];
};

export type CustomerCreateViewProps = {
  readonly displayName: string;
  readonly phone: string;
  readonly note: string;
  readonly duplicates: readonly CustomerDuplicateCandidate[] | undefined;
  readonly command: CommandOutcomeView;
  readonly onDisplayName: (value: string) => void;
  readonly onPhone: (value: string) => void;
  readonly onNote: (value: string) => void;
  readonly onCreate: () => void;
  readonly onReload: () => void;
  readonly onCancel: () => void;
};

export function CustomerCreateView(props: CustomerCreateViewProps) {
  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title="Thêm khách hàng" back={{ href: "/customers", label: "Hủy" }} />
      <CustomerFields
        displayName={props.displayName}
        phone={props.phone}
        note={props.note}
        onDisplayName={props.onDisplayName}
        onPhone={props.onPhone}
        onNote={props.onNote}
      />
      {props.duplicates && props.duplicates.length > 0 ? (
        <aside className="rounded-card border border-warning/50 bg-warning/5 p-4">
          <h2 className="font-semibold">Có thể đã có khách này</h2>
          <p className="text-body-sm">Tên trùng vẫn được phép. Hãy kiểm tra trước khi tạo thêm.</p>
          <ul className="mt-2 list-disc pl-5 text-body-sm">
            {props.duplicates.map((candidate) => (
              <li key={candidate.customer.id}>
                <Link href={`/customers/${candidate.customer.id}`} className="text-info underline">
                  {candidate.customer.displayName} · {candidate.customer.phone ?? "không có SĐT"}
                </Link>{" "}
                ({candidate.reasons.includes("same_phone") ? "trùng số điện thoại" : "trùng tên"})
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
      <ActionDock
        label="Hành động khách hàng"
        summary={
          <p className="text-body-sm font-semibold text-ink">Kiểm tra thông tin trước khi tạo</p>
        }
        secondary={
          <Button tone="secondary" onClick={props.onCancel}>
            Hủy
          </Button>
        }
        primary={
          <Button
            disabled={
              props.displayName.trim().length === 0 || props.command.phase.kind === "sending"
            }
            onClick={props.onCreate}
          >
            {props.command.phase.kind === "sending" ? "Đang tạo…" : "Tạo khách hàng"}
          </Button>
        }
        feedback={
          <CommandOutcome
            command={props.command}
            attemptedAction="Tạo khách hàng"
            onReload={props.onReload}
            onCancel={props.onCancel}
          />
        }
      />
    </div>
  );
}
