import { render, screen } from "@testing-library/react";
import type {
  CashStatementMatchDto,
  OperationalCloseDto,
  OperationalCloseReadiness,
  WorkspaceIntegrityDto,
} from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import { WORKSPACE_ID } from "@vuarau/test-fixtures/ids";
import { OperationsView } from "./operations-view.tsx";

const integrity: WorkspaceIntegrityDto = {
  workspaceId: WORKSPACE_ID,
  healthyCustomers: 1,
  anomalousCustomers: 0,
  missingSources: 0,
  duplicateSources: 0,
  projectionDrift: 0,
  healthySuppliers: 1,
  anomalousSuppliers: 0,
  anomalousInventoryKeys: 0,
  status: "healthy",
};

function renderView(overrides: Partial<React.ComponentProps<typeof OperationsView>> = {}) {
  return render(
    <OperationsView
      canManage
      queuedCount={0}
      blockedCount={0}
      lastSuccessfulSync={null}
      integrityState="ready"
      integrity={integrity}
      exportLocked={false}
      exportCompleted={false}
      backupSelected={false}
      validation={null}
      validationPending={false}
      fileError={null}
      restoreReason=""
      restoreLocked={false}
      restoreCompleted={false}
      onRetrySync={() => undefined}
      onRetryIntegrity={() => undefined}
      onExport={() => undefined}
      onResetExport={() => undefined}
      onBackupFileSelected={() => undefined}
      onRestoreReasonChange={() => undefined}
      onRestore={() => undefined}
      {...overrides}
    />,
  );
}

// TC-CLOSE-004
describe("OperationsView", () => {
  it("does not equate a failed integrity read with healthy", () => {
    renderView({ integrityState: "error", integrity: null });
    expect(screen.getByRole("alert")).toHaveTextContent("Không được suy ra “ổn”");
  });

  it("warns that logical backup restore is not production PITR", () => {
    renderView();
    expect(screen.getByText(/phục hồi vào một vựa trống/)).toBeInTheDocument();
  });

  it("surfaces blocked offline intent before a worker creates replacement intent", () => {
    renderView({ queuedCount: 2, blockedCount: 1 });
    expect(screen.getByRole("alert")).toHaveTextContent("Không tạo giao dịch thay thế");
  });

  it("shows the server-authored close blocker and its recovery path", () => {
    renderView({
      closeReadinessState: "ready",
      closeReadiness: {
        workspaceId: WORKSPACE_ID,
        businessDate: "2026-08-03",
        period: { start: "2026-08-02T17:00:00.000Z", end: "2026-08-03T17:00:00.000Z" },
        asOf: "2026-08-03T10:00:00.000Z",
        state: "blocked",
        blockers: ["missing_observation"],
        policyVersionId: null,
        requiredObservationKinds: ["cash_count", "inventory_count"],
        availableObservationKinds: ["cash_count"],
        missingObservationKinds: ["inventory_count"],
        existingCloseId: null,
        existingCloseState: null,
        existingCloseVersion: null,
      } as OperationalCloseReadiness,
    });
    expect(screen.getByText("Đang bị chặn")).toBeInTheDocument();
    expect(screen.getByText(/Thiếu quan sát: Đếm hàng thực tế/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ghi nhận quan sát" })).toHaveAttribute(
      "href",
      "/evidence/reconciliation",
    );
  });

  it("requires an explicit new export intent after a completed export", () => {
    renderView({ exportCompleted: true });
    expect(screen.getByRole("button", { name: "Tạo bản sao lưu mới" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xuất bản sao lưu" })).not.toBeInTheDocument();
  });

  it("locks a completed restore because the workspace is no longer an empty restore target", () => {
    renderView({
      backupSelected: true,
      validation: { valid: true, diagnostics: [] },
      restoreReason: "Diễn tập phục hồi",
      restoreCompleted: true,
    });
    expect(screen.getByRole("button", { name: "Đã phục hồi" })).toBeDisabled();
  });

  it("renders persisted close and statement state without inferring settlement", () => {
    renderView({
      operationalCloses: [
        {
          id: "close-001",
          businessDate: "2026-08-03",
          state: "closed",
          version: 1,
          observationIds: ["observation-001"],
          policyVersionId: "policy-001",
        } as unknown as OperationalCloseDto,
      ],
      statementMatches: [
        {
          id: "match-001",
          externalReference: "BANK-001",
          amount: { amountMinor: 125_000, currency: "VND" },
          statementAt: "2026-08-03T05:00:00.000Z",
          reversal: null,
        } as unknown as CashStatementMatchDto,
      ],
    });
    expect(screen.getByText("2026-08-03")).toBeInTheDocument();
    expect(screen.getByText("BANK-001")).toBeInTheDocument();
    expect(screen.getByText(/không tự suy ra trạng thái/i)).toBeInTheDocument();
  });
});
