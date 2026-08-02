import { beforeEach, describe, expect, it } from "vitest";
import { observeOperationalEvent, renderMetrics, resetMetricsForTests } from "./metrics.ts";

beforeEach(resetMetricsForTests);

describe("M22 safe operational metrics", () => {
  it("counts commands, replays, rejections, queries and integrity without business labels", () => {
    observeOperationalEvent({
      event: "command",
      requestId: "req-1",
      commandId: "command-1",
      commandType: "PostSale",
      workspaceId: "workspace-1",
      actorId: "actor-1",
      outcome: "replayed",
      code: null,
      durationMs: 12,
    });
    observeOperationalEvent({
      event: "query",
      requestId: "req-2",
      queryType: "debt.read",
      workspaceId: "workspace-1",
      actorId: "actor-1",
      outcome: "rejected",
      code: "WORKSPACE_ACCESS_DENIED",
      durationMs: 4,
    });
    observeOperationalEvent({
      event: "integrity",
      requestId: "req-3",
      workspaceId: "workspace-1",
      checkType: "workspace",
      status: "attention",
    });
    observeOperationalEvent({
      event: "exception",
      requestId: "req-4",
      procedure: "sale.post",
      code: "INTERNAL_SERVER_ERROR",
    });

    const output = renderMetrics();
    expect(output).toContain('result="postsale_replayed"');
    expect(output).toContain('result="workspace_access_denied"');
    expect(output).toContain('result="workspace_attention"');
    expect(output).toContain('family="exceptions"');
    expect(output).toContain('result="internal_server_error"');
    expect(output).not.toContain("workspace-1");
    expect(output).not.toContain("actor-1");
    expect(output).not.toContain("command-1");
    expect(output).not.toContain("req-");
  });
});
