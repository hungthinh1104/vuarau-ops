import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReferenceDisclosure } from "./reference-disclosure.tsx";

describe("ReferenceDisclosure", () => {
  it("keeps machine references behind an explicit disclosure", () => {
    render(<ReferenceDisclosure items={[{ label: "Mã đơn", value: "order-123" }]} />);

    expect(screen.getByRole("button", { name: "Thông tin tra cứu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByText("order-123")).not.toBeVisible();
  });
});
