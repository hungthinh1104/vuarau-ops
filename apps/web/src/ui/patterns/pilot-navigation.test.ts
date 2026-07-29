import { describe, expect, it } from "vitest";
import { permissionsForRole } from "@vuarau/domain-contracts";
import { navigationFor, navigationItemIsActive } from "./pilot-navigation.ts";
import { todayActionsFor } from "./today-actions.ts";

describe("TC-WEB-029 — role-aware pilot navigation", () => {
  it("shows only destinations backed by server-authored permissions", () => {
    const sales = navigationFor(permissionsForRole("sales"))
      .flatMap((group) => group.items)
      .map((item) => item.label);
    expect(sales).toContain("Đơn hàng");
    expect(sales).toContain("Khách hàng");
    expect(sales).not.toContain("Nhận hàng");
    expect(sales).not.toContain("Thành viên");

    const warehouse = navigationFor(permissionsForRole("warehouse"))
      .flatMap((group) => group.items)
      .map((item) => item.label);
    expect(warehouse).toContain("Nhận hàng");
    expect(warehouse).toContain("Tồn kho");
    expect(warehouse).not.toContain("Thanh toán");
  });

  it("matches detail routes to their bounded navigation destination", () => {
    expect(navigationItemIsActive("/sales/abc", "/sales")).toBe(true);
    expect(navigationItemIsActive("/suppliers/abc", "/sales")).toBe(false);
    expect(navigationItemIsActive("/today/other", "/today")).toBe(false);
  });

  it("builds Today work from permissions rather than role names", () => {
    const sales = todayActionsFor(permissionsForRole("sales")).map((action) => action.label);
    expect(sales).toContain("Ghi đơn nhanh");
    expect(sales).toContain("Thanh toán và công nợ");
    expect(sales).not.toContain("Nhận hàng");

    const warehouse = todayActionsFor(permissionsForRole("warehouse")).map(
      (action) => action.label,
    );
    expect(warehouse).toContain("Nhận hàng");
    expect(warehouse).toContain("Giao hàng");
    expect(warehouse).not.toContain("Thanh toán và công nợ");
  });
});
