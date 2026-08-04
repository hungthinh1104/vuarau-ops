"use client";

import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { rejectionStateOf } from "@/ui/domain/domain-error.ts";
import { BusinessRejection } from "./business-rejection.tsx";
import { PermissionDenied } from "./permission-denied.tsx";
import { StaleVersionNotice } from "./stale-version-notice.tsx";
import { UnknownNetworkOutcome } from "./unknown-network-outcome.tsx";

export type CommandOutcomeProps = {
  readonly command: CommandOutcomeView;
  /** What was being done, in the user's words. "Ghi nhận thanh toán 500.000 ₫". */
  readonly attemptedAction: string;
  readonly onReload: () => void;
  readonly onCancel?: () => void;
  /** Multi-command flows may redirect after the final command only. */
  readonly suppressSuccessToast?: boolean;
};

/**
 * Every way a command can end, in one component, with the branch order visible.
 *
 * **Unknown is checked before rejected**, and that ordering is the point. An
 * unknown outcome is not an error: the command may have committed, and rendering
 * it as a failure is how a worker taps again with a fresh key and creates a second
 * sale. Only after that is ruled out does anything look like a refusal.
 *
 * Shared by every workflow rather than written per screen. Two screens that each
 * decided what a dropped connection means would eventually decide differently, and
 * the one that got it wrong would be the one used at 3 a.m.
 */
export function CommandOutcome({
  command,
  attemptedAction,
  onReload,
  onCancel,
  suppressSuccessToast = false,
}: CommandOutcomeProps) {
  const toastedCommand = useRef<string | null>(null);

  useEffect(() => {
    if (suppressSuccessToast || command.phase.kind !== "succeeded") return;
    const commandId = command.pending?.identity.commandId ?? null;
    if (commandId === null || toastedCommand.current === commandId) return;
    toastedCommand.current = commandId;
    toast.success("Đã ghi nhận", {
      description: attemptedAction,
      duration: 2_500,
    });
  }, [
    attemptedAction,
    command.pending?.identity.commandId,
    command.phase.kind,
    suppressSuccessToast,
  ]);

  // Success is intentionally ephemeral. A redirecting workflow should not
  // paint a second success banner for the one command that just navigated.
  if (command.phase.kind === "sending" || command.phase.kind === "succeeded") return null;

  if (command.phase.kind === "unknown" && command.pending !== null) {
    return (
      <UnknownNetworkOutcome
        identity={command.pending.identity}
        attempts={command.pending.attempts}
        attemptedAction={attemptedAction}
        requestId={command.requestId}
        onResend={() => void command.resend()}
        {...(onCancel !== undefined ? { onCancel } : {})}
      />
    );
  }

  if (command.error !== null) {
    const state = rejectionStateOf(command.error.code);

    if (state === "permission_denied") {
      return (
        <PermissionDenied
          error={command.error}
          attemptedAction={attemptedAction}
          requestId={command.requestId}
        />
      );
    }
    if (state === "stale_version") {
      // Reload and show what changed. Never a retry with the new version: that
      // would apply an intention formed against data this user never saw.
      return (
        <StaleVersionNotice
          error={command.error}
          onReload={onReload}
          requestId={command.requestId}
        />
      );
    }
    // Everything else keeps the form exactly as typed. Nothing here clears a
    // field, and the copy says what to change rather than that something is wrong.
    return <BusinessRejection error={command.error} requestId={command.requestId} />;
  }

  return null;
}
