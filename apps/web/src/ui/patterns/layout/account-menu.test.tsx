import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { salesSession } from "@/fixtures/session.fixtures.ts";
import { AccountMenu } from "./account-menu.tsx";

describe("AccountMenu", () => {
  it("keeps account actions keyboard reachable in the sheet", () => {
    const onChangeWorkspace = vi.fn();
    const onSignOut = vi.fn();
    render(
      <AccountMenu
        session={salesSession}
        userLabel="sales@example.com"
        onChangeWorkspace={onChangeWorkspace}
        onSignOut={onSignOut}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Mở tài khoản" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("sales@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đổi vựa" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đăng xuất" })).toBeInTheDocument();
  });
});
