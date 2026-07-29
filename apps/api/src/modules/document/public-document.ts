import type { IncomingMessage, ServerResponse } from "node:http";
import { hashPayload } from "../../infrastructure/hash.ts";
import type { CommandDeps } from "../shared/command-pipeline.ts";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function getPublicDocument(deps: CommandDeps, token: string) {
  const result = await deps.uow.transaction((repos) =>
    repos.documentReads.publicByTokenHash(hashPayload(token), deps.clock.now()),
  );
  if (result.kind !== "found") return result;
  if (hashPayload(result.document.snapshot) !== result.document.digest)
    return { kind: "integrity_error" as const };
  const title = `${result.document.documentType.replaceAll("_", " ")} · v${result.document.version}`;
  const body = escapeHtml(JSON.stringify(result.document.snapshot, null, 2));
  return {
    kind: "found" as const,
    document: result.document,
    html: `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font:16px system-ui;margin:2rem;max-width:60rem}pre{white-space:pre-wrap}@media print{body{margin:0}}</style></head><body><h1>${escapeHtml(title)}</h1><p>Mã kiểm tra: ${result.document.digest}</p><pre>${body}</pre></body></html>`,
  };
}

export function createPublicDocumentHandler(
  deps: CommandDeps,
): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  return async (req, res) => {
    const path = (req.url ?? "").split("?")[0] ?? "";
    const match = /^\/public\/documents\/([A-Za-z0-9_-]{32,})$/.exec(path);
    if (match === null || req.method !== "GET") return false;
    const result = await getPublicDocument(deps, match[1]!);
    if (result.kind !== "found") {
      const status =
        result.kind === "not_found" ? 404 : result.kind === "integrity_error" ? 409 : 410;
      res.writeHead(status, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(
        status === 404
          ? "Document not found"
          : status === 409
            ? "Document integrity check failed"
            : "Document link unavailable",
      );
      return true;
    }
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
    });
    res.end(result.html);
    return true;
  };
}
