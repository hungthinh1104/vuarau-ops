import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ownerSession,
  salesSession,
  warehouseSession,
  WORKSPACE_NAME,
} from "../../fixtures/session.fixtures.ts";
import { WorkspaceShell } from "./workspace-shell.tsx";

describe("Goods Truth workspace navigation", () => {
  it("exposes supplier and Purchase reads to every role with server capabilities", () => {
    for (const session of [ownerSession, warehouseSession]) {
      const { unmount } = render(
        <WorkspaceShell workspaceName={WORKSPACE_NAME} session={session}>
          <p>Nội dung</p>
        </WorkspaceShell>,
      );
      expect(screen.getByRole("link", { name: "Nhà cung cấp" })).toHaveAttribute(
        "href",
        "/suppliers",
      );
      expect(screen.getByRole("link", { name: "Đơn mua" })).toHaveAttribute("href", "/purchases");
      unmount();
    }
  });

  it("does not invent Goods navigation when the role lacks read capabilities", () => {
    render(
      <WorkspaceShell workspaceName={WORKSPACE_NAME} session={salesSession}>
        <p>Nội dung</p>
      </WorkspaceShell>,
    );
    expect(screen.queryByRole("link", { name: "Nhà cung cấp" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Đơn mua" })).not.toBeInTheDocument();
  });
});
