"use client";

import type { CommandIdentity } from "@/ui/domain/command-state.ts";
import { Button } from "@/ui/primitives/button.tsx";

export type UnknownNetworkOutcomeProps = {
  /**
   * The identity of the command whose outcome is unknown, carried unchanged.
   *
   * Passed in rather than minted here, and there is deliberately no way for this
   * component to make a new one. `onResend` re-sends **this** identity.
   */
  readonly identity: CommandIdentity;
  readonly attempts: number;
  /** What was being done, in the user's words. "Ghi nhận thanh toán 500.000 ₫". */
  readonly attemptedAction: string;
  readonly onResend: (identity: CommandIdentity) => void;
  readonly onCancel?: () => void;
};

/**
 * The request timed out or the connection dropped. **The command may have
 * committed**, and the client cannot know.
 *
 * The required behaviour, and the reason this is a component rather than a toast:
 *
 *   1. Say it is **unconfirmed**, not failed. "Thất bại" invites a fresh attempt,
 *      and a fresh attempt is where the second sale comes from.
 *   2. Keep the original `commandId` and `idempotencyKey`.
 *   3. Resubmit the **identical** command, which either returns the original
 *      result (`duplicate_safe_retry`) or completes it.
 *
 * What must never happen is regenerating the key on resubmit. That turns one sale
 * into two, and no server-side rule can prevent it, because a fresh key is
 * indistinguishable from a genuinely new command. The UI state catalog calls this
 * "the single most important line in this catalog".
 *
 * At a wholesale market at 3 a.m. this is not an edge case; it is Tuesday.
 */
export function UnknownNetworkOutcome({
  identity,
  attempts,
  attemptedAction,
  onResend,
  onCancel,
}: UnknownNetworkOutcomeProps) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-card border border-offline/40 bg-offline-soft px-4 py-3"
    >
      <div>
        <p className="text-label font-semibold text-offline">Chưa rõ kết quả</p>
        <p className="mt-1 text-body-sm text-ink">
          Mất kết nối khi đang gửi. {attemptedAction} có thể đã được ghi, có thể chưa.
        </p>
      </div>

      <p className="text-body-sm text-ink">
        Bấm gửi lại để hệ thống kiểm tra. Lệnh gửi lại là <strong>đúng lệnh cũ</strong>, nên nếu máy
        chủ đã ghi rồi thì sẽ không ghi thêm lần nữa.
      </p>

      <p className="text-caption text-ink-muted">
        Lần gửi thứ {attempts}
        {/* The key is shown because it is the thing a support conversation needs,
            and because a visible key is one somebody would notice changing. */}
        <span className="ml-2 tabular" data-testid="idempotency-key">
          {identity.idempotencyKey}
        </span>
      </p>

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel !== undefined ? (
          <Button tone="secondary" onClick={onCancel}>
            Để sau
          </Button>
        ) : null}
        {/* Passes the identity straight back. There is no branch here that could
            produce a different one. */}
        <Button onClick={() => onResend(identity)}>Gửi lại</Button>
      </div>
    </div>
  );
}
