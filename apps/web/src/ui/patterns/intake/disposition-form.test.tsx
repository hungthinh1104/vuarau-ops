import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GoodsArrivalLineId, QualityDispositionSource } from "@vuarau/domain-contracts";
import { describe, expect, it, vi } from "vitest";
import { testUuid } from "@vuarau/test-fixtures/ids";
import { DispositionForm } from "./disposition-form.tsx";

const source: QualityDispositionSource = {
  type: "arrival_line",
  arrivalLineId: testUuid("6", 4) as GoodsArrivalLineId,
};

describe("DispositionForm", () => {
  it("reveals issue handling only after the worker asks for it", async () => {
    const user = userEvent.setup();
    render(
      <DispositionForm
        source={source}
        unit="kg"
        eligibleValueScaled={100_000}
        gradeRequired={false}
        allowQuarantine
        title="2. Kết quả kiểm hàng"
        grades={[]}
        values={{ accepted: "10", quarantined: "", rejected: "", disposed: "" }}
        gradeId=""
        note=""
        evidence=""
        total={10_000}
        gradeMissing={false}
        locked={false}
        onValueChange={vi.fn()}
        onGradeChange={vi.fn()}
        onNoteChange={vi.fn()}
        onEvidenceChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("Tạm giữ (kg)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Trả nhà cung cấp (kg)")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Có hàng lỗi" }));
    expect(screen.getByLabelText("Tạm giữ (kg)")).toBeInTheDocument();
    expect(screen.getByLabelText("Trả nhà cung cấp (kg)")).toBeInTheDocument();
    expect(screen.getByLabelText("Loại bỏ (kg)")).toBeInTheDocument();
  });
});
