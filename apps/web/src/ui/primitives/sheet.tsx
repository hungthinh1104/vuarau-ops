"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { IconButton } from "./icon-button.tsx";

export type SheetProps = {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly actions?: ReactNode;
};

/**
 * A bottom sheet for short choices on mobile — pick a customer, pick a reason
 * code — which design.md separates from a dialog by what it is for, not by how it
 * looks: a sheet is a **choice**, a dialog is a **confirmation**.
 *
 * Same `<dialog>` element underneath, for the same reason: focus trapping and
 * `Escape` are behaviours worth inheriting rather than reimplementing. On a wide
 * screen it settles into a right-hand panel; the content does not change, so a
 * choice made on a phone and on a desk is the same choice.
 */
export function Sheet({ open, title, onClose, children, actions }: SheetProps) {
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
        event.preventDefault();
        onClose();
      }}
      aria-labelledby="sheet-title"
      className={[
        "m-0 mt-auto w-full max-w-none rounded-t-panel bg-surface p-0 text-ink shadow-md",
        "backdrop:bg-ink/40",
        "sm:my-0 sm:ml-auto sm:h-full sm:w-[24rem] sm:rounded-none sm:rounded-l-panel",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
        <h2 id="sheet-title" className="text-subheading font-semibold">
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
