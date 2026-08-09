"use client";

import type { ReactNode } from "react";
import { domainErrorOf } from "@/ui/domain/domain-error.ts";
import { Button } from "@/ui/primitives/button.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
import { Skeleton } from "@/ui/primitives/skeleton.tsx";
import { BusinessRejection } from "./business-rejection.tsx";
import { PermissionDenied } from "./permission-denied.tsx";
import { RequestCorrelation } from "./request-correlation.tsx";
import { requestIdOf } from "@/lib/request-id.ts";
import { formatInstant } from "@/ui/format.ts";

/** The shape of a TanStack query, narrowed to what this needs. */
export type QueryLike<TData> = {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: unknown;
  readonly data: TData | undefined;
  readonly isFetching?: boolean;
  readonly isRefetchError?: boolean;
  readonly dataUpdatedAt?: number;
};

export type QueryStatesProps<TData> = {
  readonly query: QueryLike<TData>;
  /** What is loading, for anybody who cannot see the shimmer. */
  readonly loadingLabel: string;
  /** What the user was trying to see, used when the refusal is a permission one. */
  readonly attemptedAction?: string;
  readonly onRetry?: () => void;
  readonly children: (data: TData) => ReactNode;
};

/**
 * The three states before a read has an answer, in one place.
 *
 * Written as a component rather than repeated per screen because the branch that
 * matters is easy to get subtly wrong: **a read that has not answered must render
 * nothing quantitative**. A screen that shows an empty list while loading tells a
 * worker this customer has no debts; a screen that shows a skeleton does not.
 *
 * The error branch splits three ways, because the remedies differ. A permission
 * refusal sends the user to a person. Another business refusal sends them to a
 * different action. A transport failure is the only one worth a retry button, and
 * it is the only one that gets one.
 */
export function QueryStates<TData>({
  query,
  loadingLabel,
  attemptedAction,
  onRetry,
  children,
}: QueryStatesProps<TData>) {
  if (query.isPending && query.data === undefined) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton width="w-full" height="h-16" label={loadingLabel} />
        <Skeleton width="w-2/3" height="h-16" label="" />
      </div>
    );
  }

  if (query.isError && query.data === undefined) {
    const domainError = domainErrorOf(query.error);
    const requestId = requestIdOf(query.error);

    if (domainError === null) {
      return (
        <div className="flex flex-col gap-2">
          <EmptyState
            title="Không kết nối được máy chủ"
            description="Kiểm tra mạng rồi thử lại. Chưa có gì bị thay đổi."
            action={onRetry === undefined ? undefined : <Button onClick={onRetry}>Thử lại</Button>}
          />
          <RequestCorrelation requestId={requestId} />
        </div>
      );
    }

    if (domainError.code === "PERMISSION_DENIED") {
      return (
        <PermissionDenied
          error={domainError}
          attemptedAction={attemptedAction ?? "Xem mục này"}
          requestId={requestId}
        />
      );
    }

    return <BusinessRejection error={domainError} requestId={requestId} />;
  }

  // A query with data remains useful while TanStack refreshes it. Keep the
  // current facts visible and make freshness explicit instead of replacing the
  // screen with a second full skeleton.
  const refreshing = query.isFetching === true;
  const stale = query.isRefetchError === true || query.isError;
  return (
    <div className="grid gap-2">
      {children(query.data as TData)}
      {refreshing || stale ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-l-2 border-warning pl-3 text-caption text-ink-muted"
          role="status"
        >
          <span>
            {stale
              ? `Đang hiển thị dữ liệu cũ${query.dataUpdatedAt === undefined || query.dataUpdatedAt === 0 ? "" : ` từ ${formatInstant(new Date(query.dataUpdatedAt).toISOString())}`}.`
              : "Đang cập nhật dữ liệu mới nhất..."}
          </span>
          {stale && onRetry !== undefined ? (
            <Button tone="secondary" onClick={onRetry}>
              Thử lại
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
