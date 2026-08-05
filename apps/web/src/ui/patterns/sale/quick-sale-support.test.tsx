import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuickSaleGradeState } from "./quick-sale-blockers.tsx";
import { QuickSaleFooter } from "./quick-sale-footer.tsx";

const total = { amountMinor: 360_000, currency: "VND" as const };
const base = {
  total,
  draftExists: false,
  locallyQueued: false,
  replacementPending: false,
  mayPost: true,
  fulfilmentReady: true,
  commandLocked: false,
  posted: false,
  onDiscard: () => undefined,
  onSaveDraft: () => undefined,
  onConfirm: () => undefined,
} as const;

describe("Quick Sale support UI", () => {
  it("blocks posting when Product/grade fulfilment identity is incomplete", () => {
    render(<QuickSaleFooter {...base} fulfilmentReady={false} />);
    expect(screen.getByRole("button", { name: "Chốt đơn" })).toBeDisabled();
  });

  it("locks posting while a previous outcome is unknown/sending", () => {
    render(<QuickSaleFooter {...base} commandLocked />);
    expect(screen.getByRole("button", { name: "Chốt đơn" })).toBeDisabled();
  });

  it("surfaces missing grade configuration instead of inventing a default", () => {
    render(<QuickSaleGradeState loading={false} error={false} gradeCount={0} />);
    expect(screen.getByRole("alert")).toHaveTextContent("bổ sung hạng hàng thật");
  });
});
