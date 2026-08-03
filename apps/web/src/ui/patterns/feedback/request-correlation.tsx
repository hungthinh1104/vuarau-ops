export type RequestCorrelationProps = {
  readonly requestId: string | null | undefined;
};

/** A safe, operator-facing handle for finding the request in structured logs. */
export function RequestCorrelation({ requestId }: RequestCorrelationProps) {
  if (requestId === null || requestId === undefined) return null;

  return (
    <p className="text-caption text-ink-muted">
      Mã truy vết:{" "}
      <code className="break-all tabular" data-testid="request-id">
        {requestId}
      </code>
    </p>
  );
}
