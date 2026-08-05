import { render, screen } from "@testing-library/react";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import type { Page, SupplierObservationDto } from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import { ACTOR_ID, WORKSPACE_ID } from "@vuarau/test-fixtures/ids";
import { RECORDED_AT } from "@vuarau/test-fixtures/time";
import { SupplierObservationView } from "./supplier-observation-view.tsx";

const observation: SupplierObservationDto = {
  id: "00000000-0000-4000-8000-000000000909" as SupplierObservationDto["id"],
  workspaceId: WORKSPACE_ID,
  kind: "role",
  caseKind: "normal",
  description: "Nhà cung cấp tự giao hàng từ vùng sản xuất.",
  participantWording: "Bên tôi đóng gói rồi đưa lên xe.",
  facts: {
    supplierId: null,
    productId: null,
    qualityGradeId: null,
    supplierObservationGroupId: null,
    role: "hợp tác xã",
    sourceArea: "Đức Trọng",
    pickupResponsibility: "nhà cung cấp",
    packingResponsibility: "nhà cung cấp",
    transportResponsibility: "nhà cung cấp",
    expectedLeadTimeText: "mỗi ngày",
    paymentArrangement: "trao đổi",
    traceabilityLevel: "phiếu lô giấy",
    promisedQuantity: { valueScaled: 200_000, unit: "kg" },
    actualQuantity: { valueScaled: 190_000, unit: "kg" },
    acceptedQuantity: { valueScaled: 185_000, unit: "kg" },
    rejectedQuantity: { valueScaled: 5_000, unit: "kg" },
    expectedAt: null,
    actualAt: null,
    price: { amountMinor: 18_500, currency: "VND" },
    claimReference: "claim://supplier/ui-002",
    observationReference: "note://supplier/ui-001",
  },
  evidenceReferences: ["photo://supplier/ui-001"],
  relatedObservationId: null,
  transactionTime: RECORDED_AT,
  recordedAt: RECORDED_AT,
  actorId: ACTOR_ID,
  commandId: "00000000-0000-4000-8000-000000000910" as SupplierObservationDto["commandId"],
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

describe("SupplierObservationView", () => {
  it("TC-EVIDENCE-063 — shows source facts and keeps supplier intelligence disabled", () => {
    const page: Page<SupplierObservationDto> = { items: [observation], nextCursor: null };
    render(
      <SupplierObservationView
        canRecord
        query={ready(page)}
        items={[observation]}
        supplierId=""
        productId=""
        qualityGradeId=""
        supplierOptions={[]}
        productOptions={[]}
        qualityGradeOptions={[]}
        kind="role"
        caseKind="normal"
        description=""
        participantWording=""
        role=""
        sourceArea=""
        pickupResponsibility=""
        packingResponsibility=""
        transportResponsibility=""
        leadTime=""
        paymentArrangement=""
        traceabilityLevel=""
        promisedQuantity=""
        actualQuantity=""
        acceptedQuantity=""
        rejectedQuantity=""
        unit="kg"
        expectedAt=""
        actualAt=""
        price=""
        claimReference=""
        evidenceReferences=""
        relatedObservationId=""
        formError={null}
        command={command}
        onKind={() => undefined}
        onCaseKind={() => undefined}
        onDescription={() => undefined}
        onParticipantWording={() => undefined}
        onSupplierId={() => undefined}
        onProductId={() => undefined}
        onQualityGradeId={() => undefined}
        onRole={() => undefined}
        onSourceArea={() => undefined}
        onPickupResponsibility={() => undefined}
        onPackingResponsibility={() => undefined}
        onTransportResponsibility={() => undefined}
        onLeadTime={() => undefined}
        onPaymentArrangement={() => undefined}
        onTraceabilityLevel={() => undefined}
        onPromisedQuantity={() => undefined}
        onActualQuantity={() => undefined}
        onAcceptedQuantity={() => undefined}
        onRejectedQuantity={() => undefined}
        onUnit={() => undefined}
        onExpectedAt={() => undefined}
        onActualAt={() => undefined}
        onPrice={() => undefined}
        onClaimReference={() => undefined}
        onEvidenceReferences={() => undefined}
        onRelatedObservationId={() => undefined}
        onSubmit={() => undefined}
        onRetry={() => undefined}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Quan sát quan hệ nhà cung cấp" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Nhà cung cấp liên quan")).toBeInTheDocument();
    expect(screen.getByLabelText("Số lượng được nhận")).toBeInTheDocument();
    expect(screen.getByLabelText("Mã khiếu nại")).toBeInTheDocument();
    expect(screen.getByText("Nguồn hàng: Đức Trọng")).toBeInTheDocument();
    expect(screen.getByText("Đã hứa: 200 kg")).toBeInTheDocument();
    expect(screen.getByText("Được nhận: 185 kg")).toBeInTheDocument();
    expect(screen.getByText("Khiếu nại: claim://supplier/ui-002")).toBeInTheDocument();
    expect(screen.getByText(/Chưa kết luận điểm xếp hạng/)).toBeInTheDocument();
    expect(screen.getByText("photo://supplier/ui-001")).toBeInTheDocument();
  });
});
