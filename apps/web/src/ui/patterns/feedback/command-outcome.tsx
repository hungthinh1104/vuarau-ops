"use client";

import type { CommandOutcomeView } from "@/api/use-command.ts";
import { rejectionStateOf } from "@/api/domain-error.ts";
import { BusinessRejection } from "./business-rejection.tsx";
import { CommandProgressNotice } from "./command-progress-notice.tsx";
import { PermissionDenied } from "./permission-denied.tsx";
import { StaleVersionNotice } from "./stale-version-notice.tsx";
import { UnknownNetworkOutcome } from "./unknown-network-outcome.tsx";

export type CommandOutcomeProps = {
  readonly command: CommandOutcomeView;
  /** What was being done, in the user's words. "Ghi nhận thanh toán 500.000 ₫". */
  readonly attemptedAction: string;
  readonly onReload: () => void;
  readonly onCancel?: () => void;
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
}: CommandOutcomeProps) {
  if (command.phase.kind === "unknown" && command.pending !== null) {
    return (
      <UnknownNetworkOutcome
        identity={command.pending.identity}
        attempts={command.pending.attempts}
        attemptedAction={attemptedAction}
        onResend={() => void command.resend()}
        {...(onCancel !== undefined ? { onCancel } : {})}
      />
    );
  }

  if (command.error !== null) {
    const state = rejectionStateOf(command.error.code);

    if (state === "permission_denied") {
      return <PermissionDenied error={command.error} attemptedAction={attemptedAction} />;
    }
    if (state === "stale_version") {
      // Reload and show what changed. Never a retry with the new version: that
      // would apply an intention formed against data this user never saw.
      return <StaleVersionNotice error={command.error} onReload={onReload} />;
    }
    // Everything else keeps the form exactly as typed. Nothing here clears a
    // field, and the copy says what to change rather than that something is wrong.
    return <BusinessRejection error={command.error} />;
  }

  return (
    <CommandProgressNotice
      phase={command.phase}
      attemptedAction={attemptedAction}
      wasDuplicateSafeRetry={command.wasDuplicateSafeRetry}
    />
  );
}
