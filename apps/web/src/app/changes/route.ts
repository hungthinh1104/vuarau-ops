const apiOrigin = process.env["NEXT_PUBLIC_API_ORIGIN"] ?? "http://localhost:3102";

/** Same-origin proxy for the durable workspace change feed. */
export async function GET(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  const target = new URL("/changes", apiOrigin);
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
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json({ error: "changes_unavailable" }, { status: 503 });
  }
}
