import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
  AccountReconciliationResultDto,
  CommandId,
  CustomerId,
} from "@vuarau/domain-contracts";
import { describe, expect, it, vi } from "vitest";
import { mintCommandIdentity } from "@/api/command-identity.ts";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { ACTOR_ID, WORKSPACE_ID, testUuid } from "@vuarau/test-fixtures/ids";
import { AccountReconciliationView } from "./account-reconciliation-view.tsx";

const CUSTOMER_ID = testUuid("account-reconciliation", 1) as CustomerId;
const COMMAND_ID = testUuid("account-reconciliation", 2) as CommandId;
const INSTANT = "2026-08-10T10:00:00.000+07:00";

const consistentResult: AccountReconciliationResultDto = {
  kind: "consistent",
  workspace: { id: WORKSPACE_ID, name: "Vựa thử" },
  customer: { id: CUSTOMER_ID, displayName: "Cô Hoa" },
  projection: {
    balance: { amountMinor: 500_000, currency: "VND" },
    entryCount: 1,
    lastEntryTransactionTime: INSTANT,
    updatedAt: INSTANT,
  },
  ledger: {
    balance: { amountMinor: 500_000, currency: "VND" },
    classification: "receivable",
    entryCount: 1,
    latestTransactionTime: INSTANT,
    latestRecordedAt: INSTANT,
  },
  difference: { amountMinor: 0, currency: "VND" },
  diagnostics: [],
  capabilities: { rebuild: { allowed: true } },
};

const inconsistentResult: AccountReconciliationResultDto = {
  ...consistentResult,
  kind: "inconsistent",
  projection: {
    ...consistentResult.projection!,
    balance: { amountMinor: 999_999, currency: "VND" },
  },
  difference: { amountMinor: 499_999, currency: "VND" },
  diagnostics: [
    {
      code: "projection_balance_mismatch",
      entryId: null,
      sourceType: null,
      sourceId: null,
    },
  ],
};

const query = {
  isPending: false,
  isError: false,
  error: null,
  data: consistentResult,
};

const idleRebuild: CommandOutcomeView = {
  phase: { kind: "idle" },
  pending: null,
  error: null,
  requestId: null,
  wasDuplicateSafeRetry: false,
  resend: async () => undefined,
};

function succeededRebuild(): CommandOutcomeView {
  return {
    phase: { kind: "succeeded" },
    pending: {
      identity: {
        ...mintCommandIdentity({ workspaceId: WORKSPACE_ID, actorId: ACTOR_ID }),
        commandId: COMMAND_ID,
      },
      attempts: 1,
    },
    error: null,
    requestId: null,
    wasDuplicateSafeRetry: false,
    resend: async () => undefined,
  };
}

describe("AccountReconciliationView", () => {
  it("keeps the refresh action after rebuild updates the result to consistent", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <AccountReconciliationView
        customerId={CUSTOMER_ID}
        query={query}
        evidence={undefined}
        evidenceFetching={false}
        rebuild={succeededRebuild()}
        reason="Dựng lại sau đối soát"
        onReasonChange={() => undefined}
        onRebuild={() => undefined}
        onRetry={onRetry}
        onEvidence={() => undefined}
      />,
    );

    expect(screen.getByText("Khớp", { exact: true })).toBeInTheDocument();
    expect(
      screen.getByText("Đã dựng lại số dư từ sổ cái. Kết quả trên màn hình đã được cập nhật."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tải kết quả đối soát mới" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("shows the rebuild form while the result is still inconsistent", () => {
    render(
      <AccountReconciliationView
        customerId={CUSTOMER_ID}
        query={{ ...query, data: inconsistentResult }}
        evidence={undefined}
        evidenceFetching={false}
        rebuild={idleRebuild}
        reason="Dựng lại sau đối soát"
        onReasonChange={() => undefined}
        onRebuild={() => undefined}
        onRetry={() => undefined}
        onEvidence={() => undefined}
      />,
    );

    expect(screen.getByLabelText("Lý do dựng lại bảng tổng hợp")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dựng lại số dư" })).toBeEnabled();
  });
});
