import { render, screen, waitFor } from "@testing-library/react";
import { permissionsForRole } from "@vuarau/domain-contracts";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ActionDock } from "./action-dock.tsx";
import { MobileNavView } from "./mobile-nav.tsx";
import { WorkspaceChromeProvider } from "./workspace-chrome.tsx";

function Harness() {
  const [showDock, setShowDock] = useState(false);
  return (
    <WorkspaceChromeProvider>
      <button type="button" onClick={() => setShowDock((value) => !value)}>
        {showDock ? "Ẩn dock" : "Hiện dock"}
      </button>
      <MobileNavView permissions={permissionsForRole("owner")} role="owner" pathname="/products" />
      {showDock ? (
        <ActionDock
          label="Hành động"
          summary={<span>Tóm tắt</span>}
          primary={<button type="button">Lưu</button>}
        />
      ) : null}
    </WorkspaceChromeProvider>
  );
}

describe("ActionDock and workspace chrome", () => {
  it("hides mobile navigation while mounted and restores it after unmount", async () => {
    render(<Harness />);
    expect(screen.getByRole("navigation", { name: "Điều hướng di động" })).toBeInTheDocument();

    screen.getByRole("button", { name: "Hiện dock" }).click();
    await waitFor(() =>
      expect(
        screen.queryByRole("navigation", { name: "Điều hướng di động" }),
      ).not.toBeInTheDocument(),
    );

    screen.getByRole("button", { name: "Ẩn dock" }).click();
    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "Điều hướng di động" })).toBeInTheDocument(),
    );
  });
});
