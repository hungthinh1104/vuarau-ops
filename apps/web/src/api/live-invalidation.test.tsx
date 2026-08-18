import { act, render, screen, waitFor } from "@testing-library/react";
import type { WorkspaceId } from "@vuarau/domain-contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setLiveConnectionState, useLiveConnectionState } from "@/lib/live-connection.ts";
import {
  createInvalidationScheduler,
  drainDurableChanges,
  LiveInvalidation,
} from "./live-invalidation.tsx";

const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001" as WorkspaceId;

function LiveStateProbe() {
  return <output data-testid="live-state">{useLiveConnectionState()}</output>;
}

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  queryClient: { invalidateQueries: vi.fn(async () => undefined) },
  trpc: new Proxy({}, { get: () => ({ pathKey: () => ["live-test"] }) }),
}));

vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => mocks.queryClient }));
vi.mock("./access-token.ts", () => ({ browserAccessToken: () => "test-token" }));
vi.mock("./providers.tsx", () => ({ useTRPC: () => mocks.trpc }));

vi.stubGlobal("fetch", mocks.fetch);

describe("live invalidation scheduler", () => {
  afterEach(() => {
    mocks.fetch.mockReset();
    mocks.queryClient.invalidateQueries.mockClear();
    setLiveConnectionState("live");
  });

  it("drains a capped durable feed without skipping revisions", async () => {
    const reads: string[] = [];
    const read = vi.fn(async (since: string) => {
      reads.push(since);
      const start = Number(since) + 1;
      const end = Math.min(start + 199, 201);
      return {
        workspaceId: WORKSPACE_ID,
        changes: Array.from({ length: Math.max(0, end - start + 1) }, (_, offset) => ({
          revision: String(start + offset),
          commandType: "PostSale",
          topics: ["sale" as const],
          recordedAt: "2026-08-10T17:00:00.000Z",
        })),
        nextRevision: "201",
      };
    });

    await expect(drainDurableChanges(read, "0")).resolves.toEqual({
      revision: "201",
      topics: ["sale"],
    });
    expect(reads).toEqual(["0", "200"]);
  });

  it("drains beyond the former twenty-page ceiling", async () => {
    const reads: string[] = [];
    const read = vi.fn(async (since: string) => {
      reads.push(since);
      const start = Number(since) + 1;
      const end = Math.min(start + 199, 4_201);
      return {
        workspaceId: WORKSPACE_ID,
        changes: Array.from({ length: Math.max(0, end - start + 1) }, (_, offset) => ({
          revision: String(start + offset),
          commandType: "PostSale",
          topics: ["sale" as const],
          recordedAt: "2026-08-10T17:00:00.000Z",
        })),
        nextRevision: "4201",
      };
    });

    await expect(drainDurableChanges(read, "0")).resolves.toEqual({
      revision: "4201",
      topics: ["sale"],
    });
    expect(reads).toHaveLength(22);
    expect(reads.at(-1)).toBe("4200");
  });

  it("fails closed when a non-empty feed page does not advance", async () => {
    const read = vi.fn(async () => ({
      workspaceId: WORKSPACE_ID,
      changes: [
        {
          revision: "0",
          commandType: "PostSale" as const,
          topics: ["sale" as const],
          recordedAt: "2026-08-10T17:00:00.000Z",
        },
      ],
      nextRevision: "1",
    }));

    await expect(drainDurableChanges(read, "0")).rejects.toThrow("changes_feed_did_not_advance");
  });

  it("stops at the captured high-water mark while new writes continue", async () => {
    const reads: string[] = [];
    const read = vi.fn(async (since: string) => {
      reads.push(since);
      if (since === "0") {
        return {
          workspaceId: WORKSPACE_ID,
          changes: [
            {
              revision: "1",
              commandType: "PostSale",
              topics: ["sale" as const],
              recordedAt: "2026-08-10T17:00:00.000Z",
            },
          ],
          nextRevision: "3",
        };
      }
      return {
        workspaceId: WORKSPACE_ID,
        changes: [
          {
            revision: "2",
            commandType: "PostSale",
            topics: ["dashboard" as const],
            recordedAt: "2026-08-10T17:00:00.000Z",
          },
          {
            revision: "3",
            commandType: "PostSale",
            topics: ["sale" as const],
            recordedAt: "2026-08-10T17:00:00.000Z",
          },
        ],
        nextRevision: "1000",
      };
    });

    await expect(drainDurableChanges(read, "0")).resolves.toMatchObject({ revision: "3" });
    expect(reads).toEqual(["0", "1"]);
  });

  it("fails closed with a full invalidation when the durable feed has a gap", async () => {
    const read = vi.fn(async () => ({
      workspaceId: WORKSPACE_ID,
      changes: [],
      nextRevision: "5",
    }));

    const result = await drainDurableChanges(read, "0");
    expect(result.revision).toBe("5");
    expect(result.topics).toContain("sale");
    expect(result.topics).toContain("workspace");
  });

  it("coalesces a sustained 20-events-per-second burst into bounded refetch windows", async () => {
    vi.useFakeTimers();
    try {
      const invalidate = vi.fn(async () => undefined);
      const scheduler = createInvalidationScheduler(invalidate, { windowMs: 100 });

      for (let index = 0; index < 20; index += 1) {
        scheduler.request();
        await vi.advanceTimersByTimeAsync(50);
      }
      await vi.advanceTimersByTimeAsync(100);

      expect(invalidate.mock.calls.length).toBeLessThanOrEqual(11);
      expect(invalidate.mock.calls.length).toBeGreaterThan(0);
      scheduler.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not overlap a slow refetch and keeps one follow-up after the burst", async () => {
    vi.useFakeTimers();
    try {
      let release: () => void = () => undefined;
      const invalidate = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );
      const scheduler = createInvalidationScheduler(invalidate, { windowMs: 100 });

      scheduler.request();
      await vi.advanceTimersByTimeAsync(100);
      expect(invalidate).toHaveBeenCalledTimes(1);

      scheduler.request();
      scheduler.request();
      expect(invalidate).toHaveBeenCalledTimes(1);

      release();
      await vi.advanceTimersByTimeAsync(100);
      expect(invalidate).toHaveBeenCalledTimes(2);
      scheduler.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("coalesces durable topics without upgrading them to a full-root refresh", async () => {
    vi.useFakeTimers();
    try {
      const invalidate = vi.fn(async () => undefined);
      const scheduler = createInvalidationScheduler(invalidate, { windowMs: 100 });

      scheduler.request(["sale"]);
      scheduler.request(["payment", "sale"]);
      await vi.advanceTimersByTimeAsync(100);

      expect(invalidate).toHaveBeenCalledWith(["sale", "payment"]);
      scheduler.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses SSE as a wake-up and drains the durable feed before invalidating", async () => {
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(nextController) {
        controller = nextController;
      },
    });
    mocks.fetch
      .mockResolvedValueOnce(new Response(stream, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ workspaceId: WORKSPACE_ID, changes: [], nextRevision: "0" }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workspaceId: WORKSPACE_ID,
            changes: [
              {
                revision: "1",
                commandType: "PostSale",
                topics: ["dashboard", "sale"],
                recordedAt: "2026-08-10T17:00:00.000Z",
              },
            ],
            nextRevision: "1",
          }),
          { status: 200 },
        ),
      );

    const { unmount } = render(<LiveInvalidation workspaceId={WORKSPACE_ID} />);
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));

    await act(async () => {
      controller?.enqueue(
        new TextEncoder().encode(
          `event: invalidation\ndata: ${JSON.stringify({
            workspaceId: WORKSPACE_ID,
            entityType: "Sale",
            entityId: "sale-1",
            occurredAt: "2026-08-10T17:00:00.000Z",
          })}\n\n`,
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    expect(mocks.queryClient.invalidateQueries).toHaveBeenCalledTimes(2);
    unmount();
    controller?.close();
  });

  it("retries an unavailable stream without exposing it as live", async () => {
    vi.useFakeTimers();
    try {
      mocks.fetch.mockResolvedValue(new Response(null, { status: 503 }));
      const { unmount } = render(<LiveInvalidation workspaceId={WORKSPACE_ID} />);

      await act(async () => {
        await Promise.resolve();
      });
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000);
      });
      expect(mocks.fetch).toHaveBeenCalledTimes(2);
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks an initially unavailable stream stale after the reconnect window", async () => {
    vi.useFakeTimers();
    try {
      mocks.fetch.mockResolvedValue(new Response(null, { status: 503 }));
      const { unmount } = render(
        <>
          <LiveInvalidation workspaceId={WORKSPACE_ID} />
          <LiveStateProbe />
        </>,
      );

      await act(async () => {
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(3_000);
      });
      expect(screen.getByTestId("live-state")).toHaveTextContent("stale");
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks a previously connected stream stale after its reconnect window", async () => {
    vi.useFakeTimers();
    try {
      let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
      const stream = new ReadableStream<Uint8Array>({
        start(nextController) {
          controller = nextController;
        },
      });
      mocks.fetch.mockResolvedValueOnce(new Response(stream, { status: 200 }));

      const { unmount } = render(<LiveInvalidation workspaceId={WORKSPACE_ID} />);
      await act(async () => {
        await Promise.resolve();
      });
      controller?.close();
      await act(async () => {
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(3_000);
      });
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
