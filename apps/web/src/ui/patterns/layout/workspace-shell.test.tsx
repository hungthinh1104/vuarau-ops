import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ownerSession,
  salesSession,
  warehouseSession,
  WORKSPACE_NAME,
} from "@/fixtures/session.fixtures.ts";
import { WorkspaceShell } from "./workspace-shell.tsx";

const navigationState = vi.hoisted(() => ({ pathname: "/today" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigationState.pathname }));

describe("Goods Truth workspace navigation", () => {
  it("exposes supplier and Purchase reads to every role with server capabilities", () => {
    for (const session of [ownerSession, warehouseSession]) {
      const { unmount } = render(
        <WorkspaceShell
          workspaceName={WORKSPACE_NAME}
          session={session}
          userLabel="worker@example.com"
        >
          <p>Nội dung</p>
        </WorkspaceShell>,
      );
      expect(screen.getByRole("link", { name: "Nhà cung cấp" })).toHaveAttribute(
        "href",
        "/suppliers",
      );
      expect(screen.getByRole("link", { name: "Đơn mua" })).toHaveAttribute("href", "/purchases");
      expect(screen.getByRole("link", { name: "Nhận hàng" })).toHaveAttribute("href", "/intake");
      expect(screen.getByRole("link", { name: "Bảng giá" })).toHaveAttribute("href", "/pricing");
      unmount();
    }
  });

  it("does not invent Goods navigation when the role lacks read capabilities", () => {
    render(
      <WorkspaceShell
        workspaceName={WORKSPACE_NAME}
        session={salesSession}
        userLabel="sales@example.com"
      >
        <p>Nội dung</p>
      </WorkspaceShell>,
    );
    expect(screen.queryByRole("link", { name: "Nhà cung cấp" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Đơn mua" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Nhận hàng" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bảng giá" })).toHaveAttribute("href", "/pricing");
    const quickSaleLinks = screen.getAllByRole("link", { name: "Ghi đơn nhanh" });
    expect(quickSaleLinks).toHaveLength(1);
    for (const link of quickSaleLinks) expect(link).toHaveAttribute("href", "/sales/new");
  });

  it("keeps depot visible and places account actions behind the account menu", () => {
    render(
      <WorkspaceShell
        workspaceName={WORKSPACE_NAME}
        session={salesSession}
        userLabel="sales@example.com"
        onChangeWorkspace={() => undefined}
        onSignOut={() => undefined}
      >
        <p>Nội dung</p>
      </WorkspaceShell>,
    );
    expect(screen.getByText(WORKSPACE_NAME)).toBeVisible();
    const accountButton = screen.getByRole("button", { name: "Mở tài khoản" });
    expect(accountButton).toBeVisible();
    fireEvent.click(accountButton);
    expect(screen.getByText("sales@example.com")).toBeVisible();
    expect(screen.getByText("Bán hàng")).toBeVisible();
    expect(screen.getByRole("button", { name: "Đổi vựa" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
  });

  it("marks the current desktop destination and exposes the stable mobile capability map", () => {
    render(
      <WorkspaceShell
        workspaceName={WORKSPACE_NAME}
        session={salesSession}
        userLabel="sales@example.com"
      >
        <p>Nội dung</p>
      </WorkspaceShell>,
    );
    expect(screen.getAllByRole("link", { name: "Hôm nay" })).toHaveLength(2);
    expect(screen.getByRole("navigation", { name: "Điều hướng di động" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bỏ qua đến nội dung chính" })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    const mobile = within(screen.getByRole("navigation", { name: "Điều hướng di động" }));
    for (const label of ["Hôm nay", "Bán", "Kho", "Việc hôm nay", "Thêm"]) {
      expect(mobile.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it.each([
    ["/sales/new", salesSession, "Ghi đơn nhanh", "Bán"],
    ["/sales", salesSession, "Đơn hàng", "Bán"],
    ["/sales/00000000-0000-0000-0000-000000000001", salesSession, "Đơn hàng", "Bán"],
    ["/customers", salesSession, "Khách hàng", null],
    ["/workspace/operations", ownerSession, "Vận hành", null],
    ["/today", salesSession, "Hôm nay", "Hôm nay"],
  ])("exposes one current location for %s", (pathname, session, desktopLabel, mobileLabel) => {
    navigationState.pathname = pathname;
    const { unmount } = render(
      <WorkspaceShell
        workspaceName={WORKSPACE_NAME}
        session={session}
        userLabel="worker@example.com"
      >
        <p>Nội dung</p>
      </WorkspaceShell>,
    );

    const desktop = within(screen.getByRole("navigation", { name: "Điều hướng chính" }));
    const desktopCurrent = desktop
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(desktopCurrent).toHaveLength(1);
    expect(desktopCurrent[0]).toHaveTextContent(desktopLabel);

    const mobile = within(screen.getByRole("navigation", { name: "Điều hướng di động" }));
    const mobileCurrent = mobile
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(mobileCurrent).toHaveLength(mobileLabel === null ? 0 : 1);
    if (mobileLabel !== null) expect(mobileCurrent[0]).toHaveTextContent(mobileLabel);
    if (pathname === "/sales/new") {
      expect(screen.getAllByRole("link", { name: "Ghi đơn nhanh" })).toHaveLength(1);
    }
    unmount();
    navigationState.pathname = "/today";
  });
});
