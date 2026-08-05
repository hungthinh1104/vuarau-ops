import { render, screen } from "@testing-library/react";
import type { ArrivalLineHistoryDto, QualityInspectionDto } from "@vuarau/domain-contracts";
import { ACTOR_ID, WORKSPACE_ID } from "@vuarau/test-fixtures/ids";
import { RECORDED_AT } from "@vuarau/test-fixtures/time";
import { describe, expect, it } from "vitest";
import { FactHistory } from "./fact-history.tsx";

const inspection: QualityInspectionDto = {
  id: "00000000-0000-4000-8000-000000001101" as QualityInspectionDto["id"],
  workspaceId: WORKSPACE_ID,
  arrivalLineId: "00000000-0000-4000-8000-000000001102" as QualityInspectionDto["arrivalLineId"],
  inspectedQuantity: { valueScaled: 12_000, unit: "kg" },
  issues: [],
  note: "Chụp mặt hàng khi mở bao.",
  evidenceReferences: [
    "https://evidence.example.test/intake/1101/photo-1",
    "photo://device/1101/photo-2",
  ],
  transactionTime: RECORDED_AT,
  recordedAt: RECORDED_AT,
  actorId: ACTOR_ID,
  reversal: null,
  commandId: "00000000-0000-4000-8000-000000001103" as QualityInspectionDto["commandId"],
};

const facts: ArrivalLineHistoryDto = {
  arrivalLineId: inspection.arrivalLineId,
  inspections: [inspection],
  dispositions: [],
};

/** TC-INTAKE-011 — source references remain visible when reviewing intake facts. */
describe("FactHistory source evidence", () => {
  it("surfaces HTTP references as safe links and other references as text", () => {
    render(
      <FactHistory
        facts={facts}
        canInspectReverse={false}
        canDispositionReverse={false}
        onChanged={() => undefined}
      />,
    );

    expect(screen.getByText("Ảnh hoặc phiếu liên quan")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "https://evidence.example.test/intake/1101/photo-1" }),
    ).toHaveAttribute("href", "https://evidence.example.test/intake/1101/photo-1");
    expect(screen.getByText("photo://device/1101/photo-2")).toBeInTheDocument();
    expect(screen.getByText(/Chụp mặt hàng khi mở bao/)).toBeInTheDocument();
  });
});
