import type { CommandPhase } from "@/api/command-identity.ts";
import { Skeleton } from "@/ui/primitives/skeleton.tsx";

export type CommandProgressNoticeProps = {
  readonly phase: CommandPhase;
  readonly attemptedAction: string;
  /**
   * True when the server answered a **replay** with the original result — the
   * user tapped twice, or the client resent after a timeout (BR-COMMAND-001).
   */
  readonly wasDuplicateSafeRetry?: boolean;
};

/**
 * Two states that look alike and must not be confused, plus the success that is
 * easiest to get wrong.
 *
 * `command_in_progress` is the server saying an identical command is still
 * executing. It is the **only** retryable code in the catalogue: wait briefly and
 * resubmit the identical command with the identical key.
 *
 * `duplicate_safe_retry` is a **success**. The command was replayed and the server
 * returned what the first attempt produced. Rendering it as an error here would
 * train people to submit again, which is the one thing that must not happen around
 * money.
 */
export function CommandProgressNotice({
  phase,
  attemptedAction,
  wasDuplicateSafeRetry = false,
}: CommandProgressNoticeProps) {
  if (phase.kind === "idle") return null;

  if (phase.kind === "sending") {
    return (
      <div
        // `status`, not `alert`: work in progress should not interrupt what is
        // being read, whereas a refusal should.
        role="status"
        aria-live="polite"
        className="flex items-center gap-3 rounded-card border border-border bg-surface-muted px-4 py-3"
      >
        <Skeleton width="w-4" height="h-4" label="" />
        <p className="text-body-sm text-ink">Đang gửi: {attemptedAction}</p>
      </div>
    );
  }

  if (phase.kind === "succeeded") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-card border border-leaf/30 bg-leaf-soft px-4 py-3"
      >
        <p className="text-label font-semibold text-leaf">Đã ghi nhận</p>
        <p className="mt-1 text-body-sm text-ink">
          {attemptedAction}
          {wasDuplicateSafeRetry ? (
            // Said plainly, because the alternative — silence — leaves somebody
            // wondering whether their second tap made a second sale.
            <> — lệnh này đã được ghi trước đó, hệ thống không ghi thêm lần nữa.</>
          ) : null}
        </p>
      </div>
    );
  }

  // `rejected` and `unknown` are rendered by the components that can act on them:
  // the specific rejection notice, or UnknownNetworkOutcome. Returning null here
  // rather than a generic banner keeps one owner per state.
  return null;
}
