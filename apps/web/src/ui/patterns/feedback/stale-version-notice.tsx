"use client";

import type { DomainError } from "@vuarau/domain-contracts";
import { Button } from "@/ui/primitives/button.tsx";
import { messageForCode } from "@/ui/copy.ts";
import { RequestCorrelation } from "./request-correlation.tsx";

export type StaleVersionNoticeProps = {
  readonly error: DomainError;
  /**
   * Re-reads the aggregate and shows the user what it says now.
   *
   * Note the name, and note what is **not** here: there is no `onRetry`. The
   * component has no prop by which a caller could wire the button to resend the
   * command, so "helpfully" retrying with the new version cannot be done by
   * accident — it would take deleting this comment and adding a prop.
   */
  readonly onReload: () => void;
  readonly requestId?: string | null;
};

/**
 * Somebody else changed this while it was on screen.
 *
 * **The correct response is reload and show what changed — not an automatic retry
 * with the new version.** Retrying would apply an intention formed against data
 * this user never saw: they meant to post a sale of 1.200.000 ₫, and the retry
 * would post whatever it is now.
 *
 * The UI state catalog calls this "the state most likely to be implemented as a
 * silent retry by somebody trying to be helpful. It is a P0 money bug in
 * disguise." The API also refuses to help: `retryable` is false for every version
 * conflict, so a client that only auto-retries retryable codes never reaches here.
 */
export function StaleVersionNotice({ error, onReload, requestId }: StaleVersionNoticeProps) {
  const expected = readVersion(error, "expectedVersion");
  const actual = readVersion(error, "actualVersion");

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-card border border-warning/40 bg-warning-soft px-4 py-3"
    >
      <div>
        <p className="text-label font-semibold text-warning">Dữ liệu đã thay đổi</p>
        <p className="mt-1 text-body-sm text-ink">{messageForCode(error.code, error.message)}</p>
      </div>

      {expected !== null && actual !== null ? (
        <p className="text-caption text-ink-muted">
          Bạn đang xem bản {expected}; hiện tại đã là bản {actual}.
        </p>
      ) : null}

      <p className="text-body-sm text-ink">
        Hãy tải lại để xem thay đổi rồi quyết định. Hệ thống không tự gửi lại lệnh cũ.
      </p>

      <div className="flex justify-end">
        <Button tone="secondary" onClick={onReload}>
          Tải lại
        </Button>
      </div>
      <RequestCorrelation requestId={requestId} />
    </div>
  );
}

function readVersion(error: DomainError, key: string): number | null {
  const value = error.details?.[key];
  return typeof value === "number" ? value : null;
}
