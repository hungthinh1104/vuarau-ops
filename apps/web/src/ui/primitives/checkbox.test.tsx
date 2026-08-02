import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Checkbox } from "./checkbox.tsx";

describe("Checkbox", () => {
  it("uses a compact checkbox control instead of text-field sizing", () => {
    render(<Checkbox aria-label="Kho" />);

    const checkbox = screen.getByRole("checkbox", { name: "Kho" });
    expect(checkbox).toHaveClass("size-5", "accent-brand");
    expect(checkbox).not.toHaveClass("touch-target", "w-full", "min-h-[52px]");
  });
});
