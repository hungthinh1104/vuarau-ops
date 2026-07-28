import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SyncIndicatorView } from "./sync-indicator.tsx";

describe("offline sync indicator", () => {
  it("stays absent when there is no sync evidence", () => {
    const { container } = render(
      <SyncIndicatorView
        queuedCount={0}
        blockedCount={0}
        lastSuccessfulSync={null}
        onRetry={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("names queued and blocked work and exposes an explicit retry", async () => {
    const retry = vi.fn(async () => undefined);
    render(
      <SyncIndicatorView
        queuedCount={3}
        blockedCount={1}
        lastSuccessfulSync={null}
        onRetry={retry}
      />,
    );

    expect(screen.getByLabelText("Đồng bộ")).toHaveTextContent("Chờ đồng bộ: 3");
    expect(screen.getByLabelText("Đồng bộ")).toHaveTextContent("Cần xử lý: 1");
    await userEvent.click(screen.getByRole("button", { name: "Thử đồng bộ" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
