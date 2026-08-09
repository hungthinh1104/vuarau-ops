import { fireEvent, render, screen } from "@testing-library/react";
import { permissionsForRole, type WorkspaceRole } from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import { MobileNavView } from "./mobile-nav.tsx";

function renderRole(role: WorkspaceRole) {
  render(<MobileNavView permissions={permissionsForRole(role)} pathname="/today" />);
  return screen.getByRole("navigation", { name: "Điều hướng di động" });
}

describe("MobileNav capability map", () => {
  it.each(["owner", "accountant", "sales", "warehouse", "delivery"] as const)(
    "keeps stable destinations for %s",
    (role) => {
      const nav = renderRole(role);
      expect(nav).toHaveTextContent("Hôm nay");
      expect(nav).toHaveTextContent("Kho");
      expect(nav).toHaveTextContent("Thêm");
      expect(nav).not.toHaveTextContent("Việc hôm nay");
    },
  );

  it("marks the purchase destination active for receiving routes", () => {
    render(<MobileNavView permissions={permissionsForRole("owner")} pathname="/intake/123" />);
    expect(screen.getByRole("link", { name: "Mua" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps the owner capability map to five destinations", () => {
    const nav = renderRole("owner");
    expect(nav.querySelectorAll("a")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Thêm" })).toBeInTheDocument();
    expect(nav).toHaveTextContent("Thêm");
  });

  it("opens secondary destinations from Thêm without changing the primary map", () => {
    renderRole("owner");
    fireEvent.click(screen.getByRole("button", { name: "Thêm" }));
    expect(screen.getByRole("navigation", { name: "Điều hướng thêm" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Báo cáo" })).toHaveAttribute("href", "/reports");
  });
});
