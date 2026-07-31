"use client";

import { Button } from "@/ui/primitives/button.tsx";

export function LoadMoreFooter({
  visibleCount,
  noun,
  loading,
  onLoadMore,
  retrying = false,
  onRetry,
}: {
  readonly visibleCount: number;
  readonly noun: string;
  readonly loading: boolean;
  readonly onLoadMore: () => void;
  readonly retrying?: boolean;
  readonly onRetry?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <p className="tabular text-caption text-ink-muted">
        Đang hiện {visibleCount} {noun}.
      </p>
      <div className="flex items-center gap-2">
        {onRetry === undefined ? null : (
          <Button tone="secondary" onClick={onRetry} disabled={retrying}>
            Thử lại
          </Button>
        )}
        <Button tone="secondary" onClick={onLoadMore} disabled={loading}>
          {loading ? "Đang tải…" : "Tải thêm"}
        </Button>
      </div>
    </div>
  );
}
