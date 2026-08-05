"use client";

import { Toaster as SonnerToaster } from "sonner";

/**
 * The single application-level toast provider.
 *
 * Sonner is ONLY for ephemeral command feedback:
 * - saved
 * - updated
 * - retried
 * - copied
 * - undo available
 *
 * Do not use Sonner for persistent business state such as overdue debt,
 * sync conflicts, or permissions.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-center"
      offset={16}
      mobileOffset={{ bottom: 80, left: 16, right: 16 }}
      toastOptions={{
        className:
          "pointer-events-none group flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 text-body-sm text-ink",
        classNames: {
          toast:
            "pointer-events-none group flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 text-body-sm text-ink",
          description: "text-ink-muted",
          actionButton:
            "ml-auto rounded-button bg-brand px-3 py-1.5 text-label font-semibold text-white hover:bg-brand-hover",
          cancelButton:
            "ml-auto rounded-button bg-canvas px-3 py-1.5 text-label font-semibold text-ink hover:bg-border",
          error: "border-danger/30 bg-danger-soft text-danger-strong",
          success: "border-leaf/30 bg-leaf-soft text-leaf-strong",
          warning: "border-warning/30 bg-warning-soft text-warning-strong",
          info: "border-info/30 bg-info-soft text-info-strong",
        },
      }}
    />
  );
}
