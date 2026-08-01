import { render, screen } from "@testing-library/react";
import type {
  ActorId,
  CommandId,
  CustomerAccountEntryId,
  CustomerId,
  DocumentDto,
  DocumentId,
  PaymentId,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import { DocumentSnapshotView } from "./document-snapshot-view.tsx";

const workspaceId = "00000000-0000-4000-8000-000000000101" as WorkspaceId;
const customerId = "00000000-0000-4000-8000-000000000102" as CustomerId;
const documentId = "00000000-0000-4000-8000-000000000103" as DocumentId;
const paymentId = "00000000-0000-4000-8000-000000000104" as PaymentId;
const actorId = "00000000-0000-4000-8000-000000000105" as ActorId;
const entryId = "00000000-0000-4000-8000-000000000106" as CustomerAccountEntryId;
const commandId = "00000000-0000-4000-8000-000000000107" as CommandId;

const statement: DocumentDto = {
  id: documentId,
  workspaceId,
  documentType: "customer_statement",
  sourceType: "customer",
  sourceId: customerId,
  version: 2,
  generatedAt: "2026-07-24T09:00:00.000+07:00",
  generatedBy: actorId,
  digest: "a".repeat(64),
  snapshot: {
    kind: "customer_statement",
    schemaVersion: 1,
    workspace: { id: workspaceId, name: "Vựa Rau Minh Tâm" },
    customer: { id: customerId, displayName: "Cô Hoa", phone: "0909000111" },
    period: {
      from: "2026-07-20T00:00:00.000+07:00",
      to: "2026-07-23T23:59:59.999+07:00",
    },
    openingBalance: { amountMinor: 250_000, currency: "VND" },
    entries: [
      {
        id: entryId,
        workspaceId,
        customerId,
        amount: { amountMinor: -100_000, currency: "VND" },
        runningBalance: { amountMinor: 150_000, currency: "VND" },
        classification: "receivable",
        source: {
          type: "payment",
          id: paymentId,
          document: { type: "payment", id: paymentId },
          label: "Tiền mặt",
        },
        reversalOfEntryId: null,
        reasonCode: null,
        reason: null,
        transactionTime: "2026-07-23T09:00:00.000+07:00",
        recordedAt: "2026-07-23T09:00:30.000+07:00",
        actorId,
        commandId,
      },
    ],
    periodChange: { amountMinor: -100_000, currency: "VND" },
    closingBalance: { amountMinor: 150_000, currency: "VND" },
    classification: "receivable",
  },
};

describe("DocumentSnapshotView", () => {
  it("renders a printable multi-day statement instead of exposing raw JSON", () => {
    render(<DocumentSnapshotView document={statement} />);

    expect(screen.getByRole("heading", { name: "SAO KÊ CÔNG NỢ" })).toBeInTheDocument();
    expect(screen.getByText("Vựa Rau Minh Tâm")).toBeInTheDocument();
    expect(screen.getByText("Cô Hoa")).toBeInTheDocument();
    expect(screen.getByText("Thanh toán")).toBeInTheDocument();
    expect(screen.getByText("Số dư đầu kỳ")).toBeInTheDocument();
    expect(screen.getByText("Còn nợ")).toBeInTheDocument();
    expect(screen.getByText(/không phải hóa đơn thuế/i)).toBeInTheDocument();
    expect(screen.queryByText(/"schemaVersion"/)).not.toBeInTheDocument();
  });

  it("keeps legacy snapshots readable without pretending they match the new print schema", () => {
    render(
      <DocumentSnapshotView document={{ ...statement, snapshot: { legacy: true, total: 123 } }} />,
    );

    expect(screen.getByRole("heading", { name: "Chứng từ phiên bản cũ" })).toBeInTheDocument();
    expect(screen.getByText(/"legacy": true/)).toBeInTheDocument();
  });
});
