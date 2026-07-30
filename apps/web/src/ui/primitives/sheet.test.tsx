import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sheet } from "./sheet.tsx";
import { useState } from "react";

describe("Sheet", () => {
  function TestSheet({ onClose = vi.fn() }: { onClose?: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <div>
        <button onClick={() => setOpen(true)}>Open Sheet</button>
        <Sheet
          open={open}
          title="Sheet Title"
          onClose={() => {
            setOpen(false);
            onClose();
          }}
        >
          <input type="text" aria-label="First Input" />
          <button>Submit</button>
        </Sheet>
      </div>
    );
  }

  it("manages initial focus and focus restoration", async () => {
    const user = userEvent.setup();
    render(<TestSheet />);

    const openButton = screen.getByRole("button", { name: "Open Sheet" });
    openButton.focus();
    expect(openButton).toHaveFocus();

    await user.click(openButton);

    // Sheet content should be visible
    const sheet = screen.getByRole("dialog");
    expect(sheet).toBeInTheDocument();

    // Close it using the close button
    const closeButton = screen.getByRole("button", { name: "Đóng" });
    await user.click(closeButton);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Focus should be restored to the trigger
    expect(openButton).toHaveFocus();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TestSheet onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Open Sheet" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Press Escape
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on backdrop click", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TestSheet onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Open Sheet" }));

    // Click outside the sheet
    await user.pointer({ keys: "[MouseLeft]", target: document.body });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
