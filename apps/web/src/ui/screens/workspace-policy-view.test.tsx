import { render, screen } from "@testing-library/react";
import type { WorkspacePolicyAvailability, WorkspacePolicyDto } from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import { ACTOR_ID, WORKSPACE_ID } from "@vuarau/test-fixtures/ids";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { WorkspacePolicyView } from "./workspace-policy-view.tsx";

const policy: WorkspacePolicyDto = {
  id: "00000000-0000-4000-8000-000000000901" as WorkspacePolicyDto["id"],
  workspaceId: WORKSPACE_ID,
  policyKind: "payment_terms_aging",
  version: 1,
  state: "draft",
  effectiveFrom: "2026-08-01T00:00:00.000Z",
  effectiveTo: null,
  definition: {
    contractVersion: 1,
    parameters: {
      defaultTermDays: 7,
      defaultTermLabel: "7 ngày",
      customerTerms: [],
      graceDays: 0,
      agingBuckets: [{ code: "1+", label: "Quá hạn", minDaysOverdue: 1, maxDaysOverdue: null }],
      creditControl: "information_only",
    },
  },
  evidenceReferences: [],
  createdBy: ACTOR_ID,
  createdAt: "2026-08-03T00:00:00.000Z",
  approvedBy: null,
  approvedAt: null,
  retiredBy: null,
  retiredAt: null,
  commandId: "00000000-0000-4000-8000-000000000902" as WorkspacePolicyDto["commandId"],
  reason: "Chờ đối chiếu thực địa.",
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

describe("WorkspacePolicyView", () => {
  it("TC-POLICY-009 renders unavailable as an explicit state and keeps the registry boundary visible", () => {
    const availability: WorkspacePolicyAvailability[] = [
      {
        policyKind: "payment_terms_aging",
        availability: "unavailable",
        reason: "no_approved_version",
        policyVersionId: null,
        version: null,
      },
    ];
    render(
      <WorkspacePolicyView
        policies={ready({ items: [policy], nextCursor: null })}
        availability={ready(availability)}
        policyKinds={["payment_terms_aging"]}
        canManage={false}
        createCommand={command}
        approveCommand={command}
        retireCommand={command}
        onCreate={() => undefined}
        onApprove={() => undefined}
        onRetire={() => undefined}
        onRetry={() => undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: "Quy định vận hành" })).toBeInTheDocument();
    expect(screen.getByText("Chưa đủ điều kiện")).toBeInTheDocument();
    expect(screen.getByText(/Chưa có phiên bản đã duyệt/)).toBeInTheDocument();
    expect(screen.getByText(/chưa có/)).toBeInTheDocument();
    expect(screen.getByText(/Việc lưu quy định chưa tự thay đổi số liệu/)).toBeInTheDocument();
  });
});
