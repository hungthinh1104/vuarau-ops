import { render, screen, within } from "@testing-library/react";
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
      expect(screen.getByRole("link", { name: "Nhận hàng" })).toHaveAttribute("href", "/purchases");
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
    expect(screen.queryByRole("link", { name: "Nhận hàng" })).not.toBeInTheDocument();
    const quickSaleLinks = screen.getAllByRole("link", { name: "Ghi đơn nhanh" });
    expect(quickSaleLinks).toHaveLength(2);
    for (const link of quickSaleLinks) expect(link).toHaveAttribute("href", "/sales/new");
  });

  it("keeps depot, user, role, workspace change and sign-out visible", () => {
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
    expect(screen.getByText("sales@example.com")).toBeVisible();
    expect(screen.getByText("Bán hàng")).toBeVisible();
    expect(screen.getByRole("button", { name: "Đổi vựa" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Đăng xuất" })).toBeVisible();
  });

  it("marks the current desktop destination and exposes the five mobile concepts", () => {
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
    for (const label of ["Hôm nay", "Đơn hàng", "Khách hàng", "Công việc", "Thêm"]) {
      expect(
        screen
          .getByRole("navigation", { name: "Điều hướng di động" })
          .querySelector(
            `a[href="${label === "Hôm nay" ? "/today" : label === "Đơn hàng" ? "/sales" : label === "Khách hàng" ? "/customers" : label === "Công việc" ? "/today#work" : "/today#more"}"]`,
          ),
      ).not.toBeNull();
    }
  });

  it.each([
    ["/sales/new", salesSession, "Ghi đơn nhanh", null],
    ["/sales", salesSession, "Đơn hàng", "Đơn hàng"],
    ["/sales/00000000-0000-0000-0000-000000000001", salesSession, "Đơn hàng", "Đơn hàng"],
    ["/customers", salesSession, "Khách hàng", "Khách hàng"],
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
