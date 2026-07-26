export type SkeletonProps = {
  /** Tailwind width class. Varying it stops a list of skeletons looking like a table. */
  readonly width?: string;
  readonly height?: string;
  /**
   * What is loading, for anybody who cannot see the shimmer. Announced politely,
   * so it does not interrupt whatever is being read.
   */
  readonly label?: string;
};

/**
 * The placeholder that must never be a number.
 *
 * This is the reason the primitive exists at all: a screen that renders `0 ₫`
 * while the real balance is arriving tells a worker that somebody who owes
 * 12.000.000 ₫ owes nothing, and they will act on it (UI state catalog §1). A
 * skeleton is unmistakably "not yet"; a zero is a fact.
 */
export function Skeleton({ width = "w-24", height = "h-4", label }: SkeletonProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={["inline-block animate-pulse rounded bg-surface-muted", width, height].join(" ")}
    >
      <span className="sr-only">{label ?? "Đang tải…"}</span>
    </span>
  );
}
