import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import type { SaleDetailDto, SaleFulfilmentDto } from "@vuarau/domain-contracts";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { saleReplacement } from "@/fixtures/sale.fixtures.ts";
import { NewDeliveryView } from "./new-delivery-view.tsx";

const command: CommandOutcomeView = {
  phase: { kind: "idle" },
  pending: null,
  error: null,
  requestId: null,
  wasDuplicateSafeRetry: false,
  resend: async () => undefined,
};

const line = saleReplacement.lines[0]!;
const ungradedLine = { ...line, qualityGradeId: null, qualityGradeName: null };
const detail: SaleDetailDto = {
  sale: { ...saleReplacement, lines: [ungradedLine] },
  displayReference: "BH-UNGRADED",
  customer: { id: saleReplacement.customerId, displayName: "Chị Lan", phone: null },
  workspace: { id: saleReplacement.workspaceId, name: "Vựa thử" },
  accountEffect: null,
  correction: { voidRecord: null, replacedBySaleId: null },
};
const fulfilment: SaleFulfilmentDto = {
  saleId: saleReplacement.id,
  integrity: "healthy",
  capabilities: { createDelivery: { allowed: true } },
  lines: [
    {
      saleLineId: ungradedLine.lineId,
      productId: ungradedLine.productId,
      productName: ungradedLine.productName,
      qualityGradeId: null,
      qualityGradeName: null,
      ordered: ungradedLine.quantity,
      dispatched: { valueScaled: 0, unit: ungradedLine.quantity.unit },
      returned: { valueScaled: 0, unit: ungradedLine.quantity.unit },
      netFulfilled: { valueScaled: 0, unit: ungradedLine.quantity.unit },
      remaining: ungradedLine.quantity,
      fulfilmentState: "unfulfilled",
      blockedReason: null,
    },
  ],
};

describe("NewDeliveryView", () => {
  it("renders and can deliver an ungraded sale line", async () => {
    const onSubmit = vi.fn();
    render(
      <NewDeliveryView
        saleId={saleReplacement.id}
        detail={detail}
        fulfilment={fulfilment}
        quantities={{}}
        note=""
        evidence=""
        onsiteCompletion={false}
        command={command}
        dispatchCommand={command}
        deliveredCommand={command}
        partialCompletion={null}
        onQuantityChange={() => undefined}
        onNoteChange={() => undefined}
        onEvidenceChange={() => undefined}
        onOnsiteCompletionChange={() => undefined}
        onSubmit={onSubmit}
        onReload={() => undefined}
      />,
    );

    expect(screen.getByText(/Không phân loại/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Xuất kho & bắt đầu giao" })).toBeEnabled();
    await screen.getByRole("button", { name: "Xuất kho & bắt đầu giao" }).click();
    expect(onSubmit).toHaveBeenCalledWith("dispatch", false);
  });

  it("does not submit when every line has no remaining quantity", () => {
    const onSubmit = vi.fn();
    render(
      <NewDeliveryView
        saleId={saleReplacement.id}
        detail={detail}
        fulfilment={{
          ...fulfilment,
          lines: [{ ...fulfilment.lines[0]!, remaining: { valueScaled: 0, unit: "kg" } }],
        }}
        quantities={{}}
        note=""
        evidence=""
        onsiteCompletion={false}
        command={command}
        dispatchCommand={command}
        deliveredCommand={command}
        partialCompletion={null}
        onQuantityChange={() => undefined}
        onNoteChange={() => undefined}
        onEvidenceChange={() => undefined}
        onOnsiteCompletionChange={() => undefined}
        onSubmit={onSubmit}
        onReload={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "Xuất kho & bắt đầu giao" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Lưu để giao sau" })).toBeDisabled();
  });

  it("requires an explicit onsite option before completing immediately", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    function Harness() {
      const [onsiteCompletion, setOnsiteCompletion] = useState(false);
      return (
        <NewDeliveryView
          saleId={saleReplacement.id}
          detail={detail}
          fulfilment={fulfilment}
          quantities={{}}
          note=""
          evidence=""
          onsiteCompletion={onsiteCompletion}
          command={command}
          dispatchCommand={command}
          deliveredCommand={command}
          partialCompletion={null}
          onQuantityChange={() => undefined}
          onNoteChange={() => undefined}
          onEvidenceChange={() => undefined}
          onOnsiteCompletionChange={setOnsiteCompletion}
          onSubmit={onSubmit}
          onReload={() => undefined}
        />
      );
    }
    render(<Harness />);

    expect(screen.getByRole("button", { name: "Xuất kho & bắt đầu giao" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Xuất kho & giao tại chỗ" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Khách nhận tại chỗ" }));
    await user.click(screen.getByRole("button", { name: "Xuất kho & giao tại chỗ" }));
    expect(onSubmit).toHaveBeenCalledWith("dispatch", true);
  });
});
