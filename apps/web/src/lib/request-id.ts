const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Read the correlation id from a tRPC response without depending on the tRPC
 * error class. The browser may also give us a plain Error (or a test double),
 * so every boundary is narrowed and an absent/malformed id stays absent.
 */
export function requestIdOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;

  const meta = (error as { meta?: unknown }).meta;
  if (typeof meta !== "object" || meta === null) return null;

  const response = (meta as { response?: unknown }).response;
  if (typeof response !== "object" || response === null) return null;

  const headers = (response as { headers?: unknown }).headers;
  if (typeof headers !== "object" || headers === null) return null;

  const get = (headers as { get?: unknown }).get;
  if (typeof get !== "function") return null;

  try {
    const value = get.call(headers, "x-request-id");
    return typeof value === "string" && REQUEST_ID_PATTERN.test(value) ? value : null;
  } catch {
    return null;
  }
}
