import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ownerSession,
  salesSession,
  warehouseSession,
  WORKSPACE_NAME,
} from "../../fixtures/session.fixtures.ts";
import { WorkspaceShell } from "./workspace-shell.tsx";

vi.mock("next/navigation", () => ({ usePathname: () => "/today" }));

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
});
