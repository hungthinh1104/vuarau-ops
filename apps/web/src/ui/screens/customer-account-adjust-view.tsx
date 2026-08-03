"use client";

import type {
  CustomerId,
  DebtAdjustmentDirection,
  DebtAdjustmentReasonCode,
} from "@vuarau/domain-contracts";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { PermissionDenied } from "@/ui/patterns/feedback/permission-denied.tsx";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { DebtAdjustmentForm } from "@/ui/patterns/customer/debt-adjustment-form.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";

export type CustomerAccountAdjustViewProps = {
  readonly customerId: CustomerId;
  readonly customer: QueryLike<unknown>;
  readonly canAdjust: boolean;
  readonly role: string;
  readonly command: CommandOutcomeView;
  readonly onSubmit: (input: {
    readonly direction: DebtAdjustmentDirection;
    readonly reasonCode: DebtAdjustmentReasonCode;
    readonly amountMinor: number;
    readonly reason: string;
  }) => void;
  readonly onRetry: () => void;
  readonly onCancel: () => void;
};

export function CustomerAccountAdjustView(props: CustomerAccountAdjustViewProps) {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Điều chỉnh công nợ"
        back={{ href: `/customers/${props.customerId}`, label: "Khách hàng" }}
      />
      <QueryStates
        query={props.customer}
        loadingLabel="Đang tải công nợ"
        attemptedAction="Điều chỉnh công nợ"
        onRetry={props.onRetry}
      >
        {() => (
          <>
            {!props.canAdjust ? (
              <PermissionDenied
                error={{
                  code: "PERMISSION_DENIED",
                  message: "Role does not carry permission 'debt.adjust'.",
                  details: { permission: "debt.adjust", role: props.role },
                  retryable: false,
                }}
                attemptedAction="Điều chỉnh công nợ"
              />
            ) : (
              <DebtAdjustmentForm
                disabled={
                  props.command.phase.kind === "sending" || props.command.phase.kind === "succeeded"
                }
                onSubmit={props.onSubmit}
              />
            )}
            <CommandOutcome
              command={props.command}
              attemptedAction="Điều chỉnh công nợ"
              onReload={props.onRetry}
              onCancel={props.onCancel}
            />
          </>
        )}
      </QueryStates>
    </div>
  );
}
