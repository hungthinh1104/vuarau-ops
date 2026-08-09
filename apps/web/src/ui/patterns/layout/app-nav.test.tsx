import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { permissionsForRole } from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import { AppNavView } from "./app-nav.tsx";

describe("AppNav", () => {
  it("persists the collapsed icon rail choice", async () => {
    window.localStorage.clear();
    const { unmount } = render(
      <AppNavView permissions={permissionsForRole("owner")} pathname="/today" />,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Thu gọn điều hướng" })).toBeInTheDocument(),
    );

    screen.getByRole("button", { name: "Thu gọn điều hướng" }).click();
    expect(window.localStorage.getItem("vuarau:nav-collapsed")).toBe("true");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Mở rộng điều hướng" })).toBeInTheDocument(),
    );
    unmount();

    render(<AppNavView permissions={permissionsForRole("owner")} pathname="/today" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Mở rộng điều hướng" })).toBeInTheDocument(),
    );
  });

  it("collapses to capability groups and reveals labelled destinations on demand", async () => {
    window.localStorage.clear();
    render(<AppNavView permissions={permissionsForRole("owner")} pathname="/purchases" />);
    fireEvent.click(screen.getByRole("button", { name: "Thu gọn điều hướng" }));

    const purchaseGroup = screen.getByRole("button", { name: "Mở nhóm Mua & nhập hàng" });
    expect(screen.queryByRole("link", { name: "Đơn mua" })).toBeNull();
    fireEvent.click(purchaseGroup);

    expect(screen.getByRole("link", { name: "Đơn mua" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Nhận hàng" })).toBeInTheDocument();
  });

  it("opens the active administration group instead of hiding the current destination", async () => {
    window.localStorage.clear();
    render(<AppNavView permissions={permissionsForRole("owner")} pathname="/workspace" />);

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Thành viên" })).toHaveAttribute(
        "aria-current",
        "page",
      ),
    );
  });
});
