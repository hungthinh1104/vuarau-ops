"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  dashboardEventSchema,
  workspaceChangesSinceDtoSchema,
  type WorkspaceChangeTopic,
  type WorkspaceChangesSinceDto,
  type WorkspaceId,
} from "@vuarau/domain-contracts";
import { useEffect } from "react";
import { browserAccessToken } from "./access-token.ts";
import { useTRPC } from "./providers.tsx";
import { setLiveConnectionState } from "@/lib/live-connection.ts";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type InvalidationSchedulerOptions = {
  readonly windowMs?: number;
};

type Invalidation = readonly WorkspaceChangeTopic[] | undefined;

/** Coalesces server hints while keeping the canonical read query authoritative. */
export function createInvalidationScheduler(
  invalidate: (topics?: Invalidation) => Promise<void>,
  { windowMs = 100 }: InvalidationSchedulerOptions = {},
): { request: (topics?: Invalidation) => void; dispose: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let queued = false;
  let fullReconcile = false;
  let disposed = false;
  const queuedTopics = new Set<WorkspaceChangeTopic>();

  const schedule = () => {
    if (disposed || timer !== null || retryTimer !== null || running) return;
    timer = setTimeout(() => {
      timer = null;
      if (disposed || !queued) return;
      queued = false;
      const topics = fullReconcile ? undefined : [...queuedTopics];
      fullReconcile = false;
      queuedTopics.clear();
      running = true;
      void invalidate(topics)
        .catch(() => {
          if (!disposed) {
            queued = true;
            if (topics === undefined) fullReconcile = true;
            else for (const topic of topics) queuedTopics.add(topic);
            retryTimer = setTimeout(() => {
              retryTimer = null;
              schedule();
            }, 3_000);
          }
        })
        .finally(() => {
          running = false;
          if (queued && !disposed && retryTimer === null) schedule();
        });
    }, windowMs);
  };

  return {
    request: (topics) => {
      if (disposed) return;
      queued = true;
      if (topics === undefined) fullReconcile = true;
      else for (const topic of topics) queuedTopics.add(topic);
      schedule();
    },
    dispose: () => {
      disposed = true;
      queued = false;
      if (timer !== null) clearTimeout(timer);
      if (retryTimer !== null) clearTimeout(retryTimer);
      timer = null;
      retryTimer = null;
    },
  };
}

const ALL_TOPICS: readonly WorkspaceChangeTopic[] = [
  "account",
  "cash",
  "customer",
  "customerOrder",
  "dashboard",
  "delivery",
  "document",
  "evidence",
  "intake",
  "inventory",
  "operations",
  "payment",
  "policy",
  "pricing",
  "product",
  "purchase",
  "quality",
  "receiving",
  "report",
  "sale",
  "session",
  "supplier",
  "supplyCommitment",
  "workspace",
];

function topicPaths(
  trpc: ReturnType<typeof useTRPC>,
  topics: Invalidation,
): readonly (readonly unknown[])[] {
  const selected = new Set(topics ?? ALL_TOPICS);
  const paths: (readonly unknown[])[] = [];
  const add = (topic: WorkspaceChangeTopic, path: readonly unknown[]) => {
    if (selected.has(topic)) paths.push(path);
  };
  add("account", trpc.account.pathKey());
  add("cash", trpc.cash.pathKey());
  add("customer", trpc.customer.pathKey());
  add("customerOrder", trpc.customerOrder.pathKey());
  add("dashboard", trpc.dashboard.pathKey());
  add("delivery", trpc.delivery.pathKey());
  add("document", trpc.document.pathKey());
  add("evidence", trpc.evidence.pathKey());
  add("intake", trpc.intake.pathKey());
  add("inventory", trpc.inventory.pathKey());
  add("operations", trpc.operations.pathKey());
  add("payment", trpc.payment.pathKey());
  add("policy", trpc.policy.pathKey());
  add("pricing", trpc.pricing.pathKey());
  add("product", trpc.product.pathKey());
  add("purchase", trpc.purchase.pathKey());
  add("quality", trpc.quality.pathKey());
  add("receiving", trpc.receiving.pathKey());
  add("report", trpc.report.pathKey());
  add("sale", trpc.sale.pathKey());
  add("session", trpc.session.pathKey());
  add("supplier", trpc.supplier.pathKey());
  add("supplyCommitment", trpc.supplyCommitment.pathKey());
  add("workspace", trpc.session.pathKey());
  return paths;
}

async function readChanges(workspaceId: WorkspaceId, since: string, signal: AbortSignal) {
  const token = browserAccessToken();
  const response = await fetch(
    `/changes?workspaceId=${encodeURIComponent(workspaceId)}&since=${encodeURIComponent(since)}&limit=200`,
    {
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
      cache: "no-store",
      signal,
    },
  );
  if (!response.ok) throw new Error("changes_unavailable");
  return workspaceChangesSinceDtoSchema.parse(await response.json());
}

/**
 * Drain every page to the high-water mark captured by the first read. The
 * latest position is not a page cursor: when a page is capped, the last
 * returned change is the only safe cursor for the next request. If the feed
 * has a gap (for example after retention), advance to the high-water mark and
 * invalidate every root so a missing page cannot look like a successful sync.
 */
export async function drainDurableChanges(
  read: (since: string) => Promise<WorkspaceChangesSinceDto>,
  initialRevision: string,
): Promise<{ readonly revision: string; readonly topics: readonly WorkspaceChangeTopic[] }> {
  const topics = new Set<WorkspaceChangeTopic>();
  let cursor = initialRevision;
  let highWater: string | null = null;
  for (;;) {
    const result = await read(cursor);
    highWater ??= result.nextRevision;
    const pageCursor = cursor;
    for (const change of result.changes) {
      cursor = change.revision;
      for (const topic of change.topics) topics.add(topic);
    }
    if (result.changes.length === 0) {
      if (cursor !== highWater) {
        cursor = highWater;
        for (const topic of ALL_TOPICS) topics.add(topic);
      }
      break;
    }
    if (cursor === pageCursor) {
      throw new Error("changes_feed_did_not_advance");
    }
    if (BigInt(cursor) >= BigInt(highWater)) break;
  }
  return { revision: cursor, topics: [...topics] };
}

/** SSE only wakes the tab; this component drains the durable feed and targets active roots. */
export function LiveInvalidation({ workspaceId }: { readonly workspaceId: WorkspaceId }) {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  useEffect(() => {
    let stopped = false;
    const abort = new AbortController();
    let revision = "0";
    let drainPromise: Promise<void> | null = null;
    const invalidate = async (topics?: Invalidation) => {
      try {
        await Promise.all(
          topicPaths(trpc, topics).map((queryKey) => queryClient.invalidateQueries({ queryKey })),
        );
        setLiveConnectionState("live");
      } catch (error) {
        setLiveConnectionState("stale");
        throw error;
      }
    };
    const scheduler = createInvalidationScheduler(invalidate);
    const drainChanges = (): Promise<void> => {
      if (drainPromise !== null) return drainPromise;
      drainPromise = (async () => {
        const result = await drainDurableChanges(
          (since) => readChanges(workspaceId, since, abort.signal),
          revision,
        );
        revision = result.revision;
        if (result.topics.length > 0) scheduler.request(result.topics);
      })().finally(() => {
        drainPromise = null;
      });
      return drainPromise;
    };
    const reconciliation = setInterval(() => {
      void drainChanges().catch(() => setLiveConnectionState("stale"));
    }, 60_000);
    let hasConnected = false;
    let staleAfterReconnectWindow = false;
    const disconnected = () => {
      if (!staleAfterReconnectWindow) setLiveConnectionState("reconnecting");
    };
    const markStaleAfterReconnectWindow = () => {
      if (stopped) return;
      staleAfterReconnectWindow = true;
      setLiveConnectionState("stale");
    };
    setLiveConnectionState("reconnecting");

    const read = async () => {
      let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
      let lastByteAt = Date.now();
      const watchdog = setInterval(() => {
        if (activeReader !== null && Date.now() - lastByteAt > 60_000) {
          setLiveConnectionState("stale");
          void activeReader.cancel();
        }
      }, 10_000);
      while (!stopped) {
        try {
          const token = browserAccessToken();
          const response = await fetch(`/events?workspaceId=${encodeURIComponent(workspaceId)}`, {
            headers: token === null ? {} : { authorization: `Bearer ${token}` },
            cache: "no-store",
            signal: abort.signal,
          });
          if (!response.ok || response.body === null) throw new Error("events_unavailable");
          const wasConnected = hasConnected;
          hasConnected = true;
          staleAfterReconnectWindow = false;
          const reader = response.body.getReader();
          activeReader = reader;
          lastByteAt = Date.now();
          setLiveConnectionState(wasConnected ? "syncing" : "live");
          if (wasConnected) {
            // Baseline first, reconcile active queries, then drain commits that
            // happened after that baseline.
            const baseline = await readChanges(workspaceId, "0", abort.signal);
            revision = baseline.nextRevision;
            await invalidate();
            await drainChanges();
          } else {
            const baseline = await readChanges(workspaceId, "0", abort.signal);
            revision = baseline.nextRevision;
            setLiveConnectionState("live");
          }
          const decoder = new TextDecoder();
          let buffer = "";
          while (!stopped) {
            const chunk = await reader.read();
            if (chunk.done) break;
            lastByteAt = Date.now();
            buffer += decoder.decode(chunk.value, { stream: true });
            const frames = buffer.split("\n\n");
            buffer = frames.pop() ?? "";
            for (const frame of frames) {
              const line = frame.split("\n").find((value) => value.startsWith("data: "));
              if (line === undefined) continue;
              const parsed = dashboardEventSchema.safeParse(JSON.parse(line.slice(6)));
              if (!parsed.success || parsed.data.workspaceId !== workspaceId) continue;
              // Ignore the hint's topic payload for correctness; the durable
              // cursor decides what actually changed and deduplicates bursts.
              void drainChanges().catch(() => setLiveConnectionState("stale"));
            }
          }
          activeReader = null;
          if (!stopped) {
            disconnected();
            await wait(3_000);
            markStaleAfterReconnectWindow();
          }
        } catch {
          if (!stopped) {
            disconnected();
            await wait(3_000);
            markStaleAfterReconnectWindow();
          }
        }
      }
      clearInterval(watchdog);
    };
    void read();
    return () => {
      stopped = true;
      abort.abort();
      scheduler.dispose();
      clearInterval(reconciliation);
    };
  }, [queryClient, trpc, workspaceId]);

  return null;
}
