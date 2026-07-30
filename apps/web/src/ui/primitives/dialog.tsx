"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Dialog as BaseDialog } from "@base-ui/react";
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
 * A modal dialog for consequential confirmations.
 *
 * Powered by Base UI to ensure robust focus trapping, portal management, and
 * accessibility (Escape key, ARIA roles). It preserves the existing API and
 * Vựa Rau visual semantics.
 */
export function Dialog({ open, title, onClose, children, actions }: DialogProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={(isOpen: boolean) => !isOpen && onClose()}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 bg-ink/40" />
        <BaseDialog.Popup
          className={[
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
            "w-[min(32rem,calc(100vw-2rem))] rounded-panel bg-surface p-0 text-ink shadow-md",
            "outline-none",
          ].join(" ")}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
            <BaseDialog.Title id="dialog-title" className="text-subheading font-semibold">
              {title}
            </BaseDialog.Title>
            <BaseDialog.Close
              render={
                <IconButton label="Đóng">
                  <X size={20} />
                </IconButton>
              }
            />
          </div>

          <div className="px-4 py-4">{children}</div>

          {actions !== undefined ? (
            <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
              {actions}
            </div>
          ) : null}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
