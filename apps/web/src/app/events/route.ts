const apiOrigin = process.env["NEXT_PUBLIC_API_ORIGIN"] ?? "http://localhost:3102";

/**
 * Stream the API invalidation channel through the web origin. A rewrite is not
 * sufficient here: Next's rewrite proxy may close an open SSE response after
 * forwarding the initial headers. Returning the upstream body preserves the
 * connection while keeping the browser same-origin.
 */
export async function GET(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  const target = new URL("/events", apiOrigin);
  target.search = incoming.search;
  const headers = new Headers();
  const authorization = request.headers.get("authorization");
  if (authorization !== null) headers.set("authorization", authorization);

  try {
    const upstream = await fetch(target, { headers, cache: "no-store" });
    const responseHeaders = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType !== null) responseHeaders.set("content-type", contentType);
    responseHeaders.set("cache-control", "no-cache, no-store");
    responseHeaders.set("x-accel-buffering", "no");
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json({ error: "events_unavailable" }, { status: 503 });
  }
}
