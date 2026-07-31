import { render, screen } from "@testing-library/react";
import type { Permission } from "@vuarau/domain-contracts";
import { permissionsForRole } from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import { MobileNavView } from "./mobile-nav.tsx";

function renderMobileNav(permissions: readonly Permission[]) {
  render(<MobileNavView permissions={permissions} pathname="/today" />);
  return screen.getByRole("navigation", { name: "Điều hướng di động" });
}

describe("MobileNav Today section destinations", () => {
  it("shows Công việc only when Today has at least one work action", () => {
    const nav = renderMobileNav(["sale.read"]);
    expect(nav.querySelector('a[href="/today#work"]')).toBeInTheDocument();
    expect(nav.querySelector('a[href="/today#more"]')).not.toBeInTheDocument();
  });

  it("shows Thêm only when Today has at least one more action", () => {
    const nav = renderMobileNav(["report.read"]);
    expect(nav.querySelector('a[href="/today#work"]')).not.toBeInTheDocument();
    expect(nav.querySelector('a[href="/today#more"]')).toBeInTheDocument();
  });

  it("does not expose dead Today anchors with no matching actions", () => {
    const nav = renderMobileNav([]);
    expect(nav.querySelector('a[href="/today#work"]')).not.toBeInTheDocument();
    expect(nav.querySelector('a[href="/today#more"]')).not.toBeInTheDocument();
  });

  it("keeps the owner projection at five destinations or fewer", () => {
    const nav = renderMobileNav(permissionsForRole("owner"));
    expect(nav.querySelectorAll("a").length).toBeLessThanOrEqual(5);
  });
});
