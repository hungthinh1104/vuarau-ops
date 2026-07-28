"use client";

import { useOffline } from "./provider.tsx";

export function SyncIndicator() {
  const offline = useOffline();
  return (
    <SyncIndicatorView
      queuedCount={offline.queuedCount}
      blockedCount={offline.blockedCount}
      lastSuccessfulSync={offline.lastSuccessfulSync}
      onRetry={offline.retry}
    />
  );
}

export function SyncIndicatorView(props: {
  readonly queuedCount: number;
  readonly blockedCount: number;
  readonly lastSuccessfulSync: string | null;
  readonly onRetry: () => Promise<void>;
}) {
  if (props.queuedCount === 0 && props.blockedCount === 0 && props.lastSuccessfulSync === null)
    return null;

  return (
    <aside
      aria-label="Đồng bộ"
      className="fixed right-3 bottom-20 z-30 rounded-card border border-border bg-surface px-3 py-2 text-caption shadow-lg"
    >
      <p>
        Chờ đồng bộ: <strong>{props.queuedCount}</strong> · Cần xử lý:{" "}
        <strong>{props.blockedCount}</strong>
      </p>
      {props.lastSuccessfulSync !== null ? (
        <p className="text-ink-muted">
          Lần cuối: {new Date(props.lastSuccessfulSync).toLocaleTimeString("vi-VN")}
        </p>
      ) : null}
      <button type="button" className="text-info underline" onClick={() => void props.onRetry()}>
        Thử đồng bộ
      </button>
    </aside>
  );
}
