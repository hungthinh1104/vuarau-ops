import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoleSetPicker, nextWorkspaceRoles } from "./role-set-picker.tsx";

describe("RoleSetPicker", () => {
  it("combines non-owner roles in deterministic order", () => {
    expect(nextWorkspaceRoles(["warehouse"], "sales")).toEqual(["sales", "warehouse"]);
  });

  it("makes owner exclusive and preserves a non-empty set", () => {
    expect(nextWorkspaceRoles(["sales", "warehouse"], "owner")).toEqual(["owner"]);
    expect(nextWorkspaceRoles(["sales"], "sales")).toEqual(["sales"]);
    expect(nextWorkspaceRoles(["owner"], "warehouse")).toEqual(["warehouse"]);
  });

  it("sends the complete next role set from the checkbox interaction", () => {
    const onChange = vi.fn();
    render(<RoleSetPicker value={["sales"]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Kho" }));
    expect(onChange).toHaveBeenCalledWith(["sales", "warehouse"]);
  });
});
