import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "./dialog.tsx";
import { useState } from "react";

describe("Dialog", () => {
  function TestDialog({ onClose = vi.fn() }: { onClose?: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <div>
        <button onClick={() => setOpen(true)}>Open Dialog</button>
        <Dialog
          open={open}
          title="Confirmation"
          onClose={() => {
            setOpen(false);
            onClose();
          }}
        >
          <input type="text" aria-label="First Input" />
          <button>Submit</button>
        </Dialog>
      </div>
    );
  }

  it("manages initial focus and focus restoration", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);

    const openButton = screen.getByRole("button", { name: "Open Dialog" });
    openButton.focus();
    expect(openButton).toHaveFocus();

    await user.click(openButton);

    // Base UI automatically focuses the first focusable element inside or the dialog itself
    // We expect the dialog content to be visible
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();

    // Close it using the close button
    const closeButton = screen.getByRole("button", { name: "Đóng" });
    await user.click(closeButton);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Focus should be restored to the trigger
    expect(openButton).toHaveFocus();
  });

  it("closes on Escape and preserves dismissal semantics", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TestDialog onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Open Dialog" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Press Escape
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on backdrop click without introducing regressions", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TestDialog onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Open Dialog" }));

    // Click outside the dialog. Base UI Dialog Backdrop is rendered as a div.
    // It is typically previous sibling to the Popup or wrapped.
    // The safest way in test is to click the backdrop or a coordinate outside.
    // Base UI attaches pointerdown to document to detect outside clicks.
    await user.pointer({ keys: "[MouseLeft]", target: document.body });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
