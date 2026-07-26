"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { IconButton } from "./icon-button.tsx";

export type DialogProps = {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  /** Rendered in a sticky footer. The primary action goes last, on the right. */
  readonly actions?: ReactNode;
};

/**
 * The native `<dialog>` element, not a div pretending to be one.
 *
 * `showModal()` gives focus trapping, `Escape`, inertness of the page behind, and
 * the correct role — four accessibility behaviours that a hand-rolled overlay
 * gets wrong one at a time. jsdom implements it, so the behaviour is testable
 * rather than merely claimed.
 *
 * Used for consequential confirmations. design.md routes payment reversal, debt
 * adjustment and conflict resolution to a full-screen flow instead: a dialog
 * says "quick decision", and those are not.
 */
export function Dialog({ open, title, onClose, children, actions }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        // Escape closes; letting the browser do it directly would skip the
        // caller's state update and leave `open` true.
        event.preventDefault();
        onClose();
      }}
      aria-labelledby="dialog-title"
      className={[
        "m-auto w-[min(32rem,calc(100vw-2rem))] rounded-panel bg-surface p-0 text-ink",
        "shadow-md backdrop:bg-ink/40",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
        <h2 id="dialog-title" className="text-subheading font-semibold">
          {title}
        </h2>
        <IconButton label="Đóng" onClick={onClose}>
          ✕
        </IconButton>
      </div>

      <div className="px-4 py-4">{children}</div>

      {actions !== undefined ? (
        <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
          {actions}
        </div>
      ) : null}
    </dialog>
  );
}
