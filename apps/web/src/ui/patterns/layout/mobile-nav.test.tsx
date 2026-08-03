import { render, screen } from "@testing-library/react";
import { permissionsForRole, type WorkspaceRole } from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import { MobileNavView } from "./mobile-nav.tsx";

function renderRole(role: WorkspaceRole) {
  render(<MobileNavView permissions={permissionsForRole(role)} role={role} pathname="/today" />);
  return screen.getByRole("navigation", { name: "Điều hướng di động" });
}

describe("MobileNav role projection", () => {
  it.each([
    ["owner", "Cảnh báo"],
    ["accountant", "Thanh toán"],
    ["sales", "Ghi đơn"],
    ["warehouse", "Nhận / Soạn"],
    ["delivery", "Chuyến giao"],
  ] as const)("uses the %s work label", (role, label) => {
    const nav = renderRole(role);
    expect(nav).toHaveTextContent(label);
    expect(nav.querySelector('a[href="/today#work"]')).toBeInTheDocument();
  });

  it("never renders more than five destinations", () => {
    const nav = renderRole("owner");
    expect(nav.querySelectorAll("a").length).toBeLessThanOrEqual(5);
  });
});
