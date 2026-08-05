import { render, screen, waitFor } from "@testing-library/react";
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
});
