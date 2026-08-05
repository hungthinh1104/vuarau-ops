import { render, screen } from "@testing-library/react";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import type { DemandObservationDto, Page } from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import { ACTOR_ID, WORKSPACE_ID } from "@vuarau/test-fixtures/ids";
import { RECORDED_AT } from "@vuarau/test-fixtures/time";
import { DemandObservationView } from "./demand-observation-view.tsx";

const observation: DemandObservationDto = {
  id: "00000000-0000-4000-8000-000000000911" as DemandObservationDto["id"],
  workspaceId: WORKSPACE_ID,
  kind: "requested_order",
  caseKind: "normal",
  description: "Khách hỏi đặt rau cho chuyến giao cuối tuần.",
  participantWording: "Thứ bảy cần khoảng ba mươi ký, chưa chốt đơn.",
  facts: {
    customerId: null,
    productId: null,
    qualityGradeId: null,
    requestedQuantity: { valueScaled: 30_000, unit: "kg" },
    minimumQuantity: null,
    requestedForAt: "2026-08-08T02:00:00.000Z",
    counterpartyLabel: "Quán ăn đầu mối",
    demandReference: "message://demand/ui-001",
  },
  evidenceReferences: ["voice://demand/ui-001"],
  relatedObservationId: null,
  transactionTime: RECORDED_AT,
  recordedAt: RECORDED_AT,
  actorId: ACTOR_ID,
  commandId: "00000000-0000-4000-8000-000000000912" as DemandObservationDto["commandId"],
};

const command: CommandOutcomeView = {
  phase: { kind: "idle" },
  pending: null,
  error: null,
  requestId: null,
  wasDuplicateSafeRetry: false,
  resend: async () => undefined,
};
const ready = <T,>(data: T) => ({ isPending: false, isError: false, error: null, data });

describe("DemandObservationView", () => {
  it("TC-EVIDENCE-067 — preserves demand facts while keeping planning outcomes disabled", () => {
    const page: Page<DemandObservationDto> = { items: [observation], nextCursor: null };
    render(
      <DemandObservationView
        canRecord
        query={ready(page)}
        items={[observation]}
        customerId=""
        productId=""
        qualityGradeId=""
        customerOptions={[]}
        productOptions={[]}
        qualityGradeOptions={[]}
        kind="requested_order"
        caseKind="normal"
        description=""
        participantWording=""
        counterpartyLabel=""
        requestedQuantity=""
        minimumQuantity=""
        requestedForAt=""
        unit="kg"
        demandReference=""
        evidenceReferences=""
        relatedObservationId=""
        formError={null}
        command={command}
        onCustomerId={() => undefined}
        onProductId={() => undefined}
        onQualityGradeId={() => undefined}
        onKind={() => undefined}
        onCaseKind={() => undefined}
        onDescription={() => undefined}
        onParticipantWording={() => undefined}
        onCounterpartyLabel={() => undefined}
        onRequestedQuantity={() => undefined}
        onMinimumQuantity={() => undefined}
        onRequestedForAt={() => undefined}
        onUnit={() => undefined}
        onDemandReference={() => undefined}
        onEvidenceReferences={() => undefined}
        onRelatedObservationId={() => undefined}
        onSubmit={() => undefined}
        onRetry={() => undefined}
      />,
    );
    expect(screen.getByRole("heading", { name: "Nhu cầu và đơn đặt dự kiến" })).toBeInTheDocument();
    expect(screen.getByLabelText("Khách hàng liên quan")).toBeInTheDocument();
    expect(screen.getByText("Nhu cầu: 30 kg")).toBeInTheDocument();
    expect(
      screen.getByText(/Chưa tạo Sale, công nợ, tồn kho hay đề xuất nhập thêm/),
    ).toBeInTheDocument();
    expect(screen.getByText("voice://demand/ui-001")).toBeInTheDocument();
  });
});
