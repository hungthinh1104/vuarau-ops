import { describe, expect, it } from "vitest";
import { permissionsForRole } from "@vuarau/domain-contracts";
import { activeNavigationHref, navigationFor } from "./pilot-navigation.ts";
import { todayActionsFor } from "@/ui/domain/today-actions.ts";

describe("TC-WEB-029 — role-aware pilot navigation", () => {
  it("shows only destinations backed by server-authored permissions", () => {
    const sales = navigationFor(permissionsForRole("sales"))
      .flatMap((group) => group.items)
      .map((item) => item.label);
    expect(sales).toContain("Ghi đơn nhanh");
    expect(sales).toContain("Đơn hàng");
    expect(sales).toContain("Khách hàng");
    expect(sales).not.toContain("Đơn mua");
    expect(sales).not.toContain("Hàng đến");
    expect(sales).not.toContain("Thành viên");

    const warehouse = navigationFor(permissionsForRole("warehouse"))
      .flatMap((group) => group.items)
      .map((item) => item.label);
    expect(warehouse).toContain("Đơn mua");
    expect(warehouse).toContain("Hàng đến");
    expect(warehouse).toContain("Tồn kho");
    expect(warehouse).not.toContain("Thành viên");

    const owner = navigationFor(permissionsForRole("owner"))
      .flatMap((group) => group.items)
      .map((item) => item.label);
    expect(owner).toContain("Vận hành");
    expect(owner).toContain("Thành viên");
    expect(owner).toContain("Khách hàng");
  });

  it.each([
    ["/sales/new", "/sales/new"],
    ["/sales", "/sales"],
    ["/sales/abc", "/sales"],
    ["/customers", "/customers"],
    ["/intake", "/intake"],
    ["/intake/abc", "/intake"],
    ["/workspace/operations", "/workspace/operations"],
    ["/today", "/today"],
  ])("resolves %s to one canonical destination", (pathname, expectedHref) => {
    expect(activeNavigationHref(pathname)).toBe(expectedHref);
  });

  it("does not expose duplicate destinations under different module names", () => {
    const items = navigationFor(permissionsForRole("owner")).flatMap((group) => group.items);
    expect(new Set(items.map((item) => item.href)).size).toBe(items.length);
    expect(items.map((item) => item.label)).not.toEqual(
      expect.arrayContaining(["Công nợ", "Thanh toán", "Đối soát"]),
    );
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
