import { render, screen } from "@testing-library/react";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import type { CostObservationDto, Page } from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import { ACTOR_ID, WORKSPACE_ID } from "@vuarau/test-fixtures/ids";
import { RECORDED_AT } from "@vuarau/test-fixtures/time";
import { EvidenceView } from "./evidence-view.tsx";

const observation: CostObservationDto = {
  id: "00000000-0000-4000-8000-000000000901" as CostObservationDto["id"],
  workspaceId: WORKSPACE_ID,
  kind: "spoilage",
  caseKind: "normal",
  description: "Một sọt bị dập sau khi vận chuyển.",
  participantWording: "Chị nói sọt này đã bị dập từ lúc xuống xe.",
  facts: {
    amount: { amountMinor: 125_000, currency: "VND" },
    quantity: { valueScaled: 2_500, unit: "kg" },
    productId: null,
    qualityGradeId: null,
    sourceReference: "note://receiving/001",
  },
  evidenceReferences: ["photo://receiving/001"],
  relatedObservationId: null,
  transactionTime: RECORDED_AT,
  recordedAt: RECORDED_AT,
  actorId: ACTOR_ID,
  commandId: "00000000-0000-4000-8000-000000000902" as CostObservationDto["commandId"],
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

function renderView() {
  const page: Page<CostObservationDto> = { items: [observation], nextCursor: null };
  return render(
    <EvidenceView
      canRecord
      query={ready(page)}
      items={[observation]}
      kind="spoilage"
      caseKind="normal"
      description=""
      participantWording=""
      amount=""
      quantity=""
      unit="kg"
      sourceReference=""
      evidenceReferences=""
      relatedObservationId=""
      formError={null}
      command={command}
      onKind={() => undefined}
      onCaseKind={() => undefined}
      onDescription={() => undefined}
      onParticipantWording={() => undefined}
      onAmount={() => undefined}
      onQuantity={() => undefined}
      onUnit={() => undefined}
      onSourceReference={() => undefined}
      onEvidenceReferences={() => undefined}
      onRelatedObservationId={() => undefined}
      onSubmit={() => undefined}
      onRetry={() => undefined}
    />,
  );
}

describe("EvidenceView", () => {
  it("TC-EVIDENCE-022 — makes the fact-only policy boundary and source visible", () => {
    renderView();

    expect(
      screen.getByRole("heading", { name: "Ghi nhận ảnh hoặc phiếu chi phí" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/không tự tạo doanh thu, lợi nhuận, công nợ hay tồn kho/),
    ).toBeInTheDocument();
    expect(screen.getByText("photo://receiving/001")).toBeInTheDocument();
    expect(screen.getByText("125.000 ₫")).toBeInTheDocument();
  });
});
