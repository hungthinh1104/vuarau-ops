import { render, screen } from "@testing-library/react";
import { permissionsForRole, type WorkspaceRole } from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import { MobileNavView } from "./mobile-nav.tsx";

function renderRole(role: WorkspaceRole) {
  render(<MobileNavView permissions={permissionsForRole(role)} role={role} pathname="/today" />);
  return screen.getByRole("navigation", { name: "Điều hướng di động" });
}

describe("MobileNav capability map", () => {
  it.each(["owner", "accountant", "sales", "warehouse", "delivery"] as const)(
    "keeps stable destinations for %s",
    (role) => {
      const nav = renderRole(role);
      expect(nav).toHaveTextContent("Hôm nay");
      expect(nav).toHaveTextContent("Kho");
      expect(nav.querySelector('a[href="/today#work"]')).toBeInTheDocument();
    },
  );

  it("marks the purchase destination active for receiving routes", () => {
    render(
      <MobileNavView
        permissions={permissionsForRole("owner")}
        role="owner"
        pathname="/intake/123"
      />,
    );
    expect(screen.getByRole("link", { name: "Mua" })).toHaveAttribute("aria-current", "page");
  });

  it("never renders more than five destinations", () => {
    const nav = renderRole("owner");
    expect(nav.querySelectorAll("a").length).toBeLessThanOrEqual(5);
  });
});
