import { render, screen } from "@testing-library/react";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import type { Page, ReconciliationObservationDto } from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import { ACTOR_ID, WORKSPACE_ID } from "@vuarau/test-fixtures/ids";
import { RECORDED_AT } from "@vuarau/test-fixtures/time";
import { ReconciliationEvidenceView } from "./reconciliation-evidence-view.tsx";

const observation: ReconciliationObservationDto = {
  id: "00000000-0000-4000-8000-000000000903" as ReconciliationObservationDto["id"],
  workspaceId: WORKSPACE_ID,
  kind: "inventory_count",
  caseKind: "normal",
  description: "Đếm thực tế tại khu sơ chế.",
  participantWording: "Phiếu đếm cuối ca ghi nhận số lượng quan sát được.",
  facts: {
    expectedAmount: null,
    observedAmount: null,
    expectedQuantity: { valueScaled: 10_000, unit: "kg" },
    observedQuantity: { valueScaled: 9_500, unit: "kg" },
    itemCount: 3,
    productId: null,
    qualityGradeId: null,
    scopeReference: "stocktake://ui-001",
  },
  evidenceReferences: ["photo://stocktake/ui-001"],
  relatedObservationId: null,
  transactionTime: RECORDED_AT,
  recordedAt: RECORDED_AT,
  actorId: ACTOR_ID,
  commandId: "00000000-0000-4000-8000-000000000904" as ReconciliationObservationDto["commandId"],
};

const command: CommandOutcomeView = {
  phase: { kind: "idle" },
  pending: null,
  error: null,
  requestId: null,
  wasDuplicateSafeRetry: false,
  resend: async () => undefined,
};

const ready = <T,>(data: T) => ({
  isPending: false,
  isError: false,
  error: null,
  data,
});

describe("ReconciliationEvidenceView", () => {
  it("TC-EVIDENCE-032 — keeps expected and observed values separate and states the policy boundary", () => {
    const page: Page<ReconciliationObservationDto> = { items: [observation], nextCursor: null };
    render(
      <ReconciliationEvidenceView
        canRecord
        query={ready(page)}
        items={[observation]}
        kind="inventory_count"
        caseKind="normal"
        description=""
        participantWording=""
        expectedAmount=""
        observedAmount=""
        expectedQuantity=""
        observedQuantity=""
        unit="kg"
        itemCount=""
        scopeReference=""
        evidenceReferences=""
        relatedObservationId=""
        formError={null}
        command={command}
        onKind={() => undefined}
        onCaseKind={() => undefined}
        onDescription={() => undefined}
        onParticipantWording={() => undefined}
        onExpectedAmount={() => undefined}
        onObservedAmount={() => undefined}
        onExpectedQuantity={() => undefined}
        onObservedQuantity={() => undefined}
        onUnit={() => undefined}
        onItemCount={() => undefined}
        onScopeReference={() => undefined}
        onEvidenceReferences={() => undefined}
        onRelatedObservationId={() => undefined}
        onSubmit={() => undefined}
        onRetry={() => undefined}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Ghi nhận đối soát hiện trường" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Lượng kỳ vọng")).toBeInTheDocument();
    expect(screen.getByText("10 kg")).toBeInTheDocument();
    expect(screen.getByText("9,5 kg")).toBeInTheDocument();
    expect(screen.getByText(/Chưa tính chênh lệch/)).toBeInTheDocument();
    expect(screen.getByText("photo://stocktake/ui-001")).toBeInTheDocument();
  });
});
