"use client";

import { useOffline } from "./provider.tsx";
import { Button } from "@/ui/primitives/button.tsx";

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
      className="fixed right-3 bottom-20 z-30 rounded-card border border-border bg-surface px-3 py-2 text-caption"
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
      <Button tone="link" onClick={() => void props.onRetry()}>
        Thử đồng bộ
      </Button>
    </aside>
  );
}
