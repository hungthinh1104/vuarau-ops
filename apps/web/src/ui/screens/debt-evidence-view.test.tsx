import { render, screen } from "@testing-library/react";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import type { DebtObservationDto, Page } from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import { ACTOR_ID, WORKSPACE_ID } from "@vuarau/test-fixtures/ids";
import { RECORDED_AT } from "@vuarau/test-fixtures/time";
import { DebtEvidenceView } from "./debt-evidence-view.tsx";

const observation: DebtObservationDto = {
  id: "00000000-0000-4000-8000-000000000905" as DebtObservationDto["id"],
  workspaceId: WORKSPACE_ID,
  kind: "agreed_due_date",
  caseKind: "normal",
  description: "Khách hẹn thanh toán sau chuyến giao.",
  participantWording: "Chiều thứ sáu tôi chuyển khoản.",
  facts: {
    amount: { amountMinor: 250_000, currency: "VND" },
    agreedDueAt: "2026-08-07T17:00:00.000Z",
    promiseToPayAt: null,
    termCode: "FRIDAY",
    termText: "Thanh toán cuối tuần",
    paymentReference: null,
    allocationProposal: null,
    customerId: null,
  },
  evidenceReferences: ["note://debt/ui-001"],
  relatedObservationId: null,
  transactionTime: RECORDED_AT,
  recordedAt: RECORDED_AT,
  actorId: ACTOR_ID,
  commandId: "00000000-0000-4000-8000-000000000906" as DebtObservationDto["commandId"],
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

describe("DebtEvidenceView", () => {
  it("TC-EVIDENCE-039 — shows term evidence while stating that ledger meaning is not inferred", () => {
    const page: Page<DebtObservationDto> = { items: [observation], nextCursor: null };
    render(
      <DebtEvidenceView
        canRecord
        query={ready(page)}
        items={[observation]}
        kind="agreed_due_date"
        caseKind="normal"
        description=""
        participantWording=""
        amount=""
        agreedDueAt=""
        promiseToPayAt=""
        termCode=""
        termText=""
        paymentReference=""
        allocationProposal=""
        evidenceReferences=""
        relatedObservationId=""
        formError={null}
        command={command}
        onKind={() => undefined}
        onCaseKind={() => undefined}
        onDescription={() => undefined}
        onParticipantWording={() => undefined}
        onAmount={() => undefined}
        onAgreedDueAt={() => undefined}
        onPromiseToPayAt={() => undefined}
        onTermCode={() => undefined}
        onTermText={() => undefined}
        onPaymentReference={() => undefined}
        onAllocationProposal={() => undefined}
        onEvidenceReferences={() => undefined}
        onRelatedObservationId={() => undefined}
        onSubmit={() => undefined}
        onRetry={() => undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: "Bằng chứng công nợ" })).toBeInTheDocument();
    expect(screen.getByText(/Ngày hẹn: .*08\/08\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/Chưa kết luận overdue hoặc thay đổi ledger/)).toBeInTheDocument();
    expect(screen.getByText("note://debt/ui-001")).toBeInTheDocument();
  });
});
