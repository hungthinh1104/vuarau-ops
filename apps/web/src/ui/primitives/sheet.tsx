"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Drawer } from "@base-ui/react";
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
 * Powered by Base UI Drawer for native-feeling swipe gestures.
 * Drawer.VirtualKeyboardProvider strictly handles CSS environment variables
 * for software-keyboard awareness. On a wide screen it settles into a right-hand panel.
 */
export function Sheet({ open, title, onClose, children, actions }: SheetProps) {
  return (
    <Drawer.Root open={open} onOpenChange={(isOpen: boolean) => !isOpen && onClose()}>
      <Drawer.VirtualKeyboardProvider>
        <Drawer.Portal>
          <Drawer.Backdrop className="fixed inset-0 bg-ink/40" />
          <Drawer.Viewport className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end">
            <Drawer.Popup
              className={[
                "pointer-events-auto mt-auto flex max-h-[96svh] w-full max-w-none flex-col",
                "rounded-t-panel border border-border bg-surface p-0 text-ink outline-none",
                "sm:mt-0 sm:h-full sm:w-[24rem] sm:max-w-[24rem]",
                "sm:rounded-none sm:rounded-l-panel",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
                <Drawer.Title id="sheet-title" className="text-subheading font-semibold">
                  {title}
                </Drawer.Title>
                <Drawer.Close
                  render={
                    <IconButton label="Đóng">
                      <X size={20} />
                    </IconButton>
                  }
                />
              </div>

              <div className="overflow-y-auto px-4 py-4">{children}</div>

              {actions !== undefined ? (
                <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
                  {actions}
                </div>
              ) : null}
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.VirtualKeyboardProvider>
    </Drawer.Root>
  );
}
