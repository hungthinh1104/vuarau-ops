import { render, screen } from "@testing-library/react";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import type { Page, SupplyCommitmentObservationDto } from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import { ACTOR_ID, WORKSPACE_ID } from "@vuarau/test-fixtures/ids";
import { RECORDED_AT } from "@vuarau/test-fixtures/time";
import { SupplyCommitmentEvidenceView } from "./supply-commitment-evidence-view.tsx";

const observation: SupplyCommitmentObservationDto = {
  id: "00000000-0000-4000-8000-000000000907" as SupplyCommitmentObservationDto["id"],
  workspaceId: WORKSPACE_ID,
  kind: "promised_supply",
  caseKind: "normal",
  description: "Đầu mối báo có thể giao rau vào sáng mai.",
  participantWording: "Mai có khoảng hai tạ nếu xe về đúng giờ.",
  facts: {
    supplierId: null,
    productId: null,
    qualityGradeId: null,
    promisedQuantity: { valueScaled: 200_000, unit: "kg" },
    minimumOrder: null,
    expectedArrivalAt: "2026-08-04T02:00:00.000Z",
    counterpartyLabel: "Đầu mối chợ sớm",
    commitmentReference: "message://supply/ui-001",
  },
  evidenceReferences: ["voice://supply/ui-001"],
  relatedObservationId: null,
  transactionTime: RECORDED_AT,
  recordedAt: RECORDED_AT,
  actorId: ACTOR_ID,
  commandId: "00000000-0000-4000-8000-000000000908" as SupplyCommitmentObservationDto["commandId"],
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

describe("SupplyCommitmentEvidenceView", () => {
  it("TC-EVIDENCE-053 — shows source facts and keeps derived meaning explicitly disabled", () => {
    const page: Page<SupplyCommitmentObservationDto> = { items: [observation], nextCursor: null };
    render(
      <SupplyCommitmentEvidenceView
        canRecord
        query={ready(page)}
        items={[observation]}
        kind="promised_supply"
        caseKind="normal"
        description=""
        participantWording=""
        counterpartyLabel=""
        promisedQuantity=""
        minimumOrder=""
        expectedArrivalAt=""
        unit="kg"
        commitmentReference=""
        evidenceReferences=""
        relatedObservationId=""
        formError={null}
        command={command}
        onKind={() => undefined}
        onCaseKind={() => undefined}
        onDescription={() => undefined}
        onParticipantWording={() => undefined}
        onCounterpartyLabel={() => undefined}
        onPromisedQuantity={() => undefined}
        onMinimumOrder={() => undefined}
        onExpectedArrivalAt={() => undefined}
        onUnit={() => undefined}
        onCommitmentReference={() => undefined}
        onEvidenceReferences={() => undefined}
        onRelatedObservationId={() => undefined}
        onSubmit={() => undefined}
        onRetry={() => undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: "Cam kết nguồn cung" })).toBeInTheDocument();
    expect(screen.getByText("Số lượng hứa: 200 kg")).toBeInTheDocument();
    expect(screen.getByText(/Chưa kết luận phải trả, tồn kho, reorder/)).toBeInTheDocument();
    expect(screen.getByText("voice://supply/ui-001")).toBeInTheDocument();
  });
});
