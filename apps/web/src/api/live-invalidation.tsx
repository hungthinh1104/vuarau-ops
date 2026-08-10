"use client";

import { useQueryClient } from "@tanstack/react-query";
import { dashboardEventSchema } from "@vuarau/domain-contracts";
import { useEffect } from "react";
import type { WorkspaceId } from "@vuarau/domain-contracts";
import { browserAccessToken } from "./access-token.ts";
import { useTRPC } from "./providers.tsx";
import { setLiveConnectionState } from "@/lib/live-connection.ts";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type InvalidationSchedulerOptions = {
  readonly windowMs?: number;
};

/**
 * Coalesces a burst of server signals without changing the refetch source of
 * truth. One slow invalidation cannot be overlapped by another, and events
 * received while it is running schedule one follow-up window.
 */
export function createInvalidationScheduler(
  invalidate: () => Promise<void>,
  { windowMs = 100 }: InvalidationSchedulerOptions = {},
): { request: () => void; dispose: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let queued = false;
  let disposed = false;

  const schedule = () => {
    if (disposed || timer !== null || running) return;
    timer = setTimeout(() => {
      timer = null;
      if (disposed || !queued) return;
      queued = false;
      running = true;
      void invalidate()
        .catch(() => undefined)
        .finally(() => {
          running = false;
          if (queued && !disposed) schedule();
        });
    }, windowMs);
  };

  return {
    request: () => {
      if (disposed) return;
      queued = true;
      schedule();
    },
    dispose: () => {
      disposed = true;
      queued = false;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}

/** Refetches canonical queries after a server invalidation signal. */
export function LiveInvalidation({ workspaceId }: { readonly workspaceId: WorkspaceId }) {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  useEffect(() => {
    let stopped = false;
    const abort = new AbortController();
    const invalidate = () =>
      Promise.all([
        // The event intentionally carries a generic command entity rather than
        // a cache vocabulary. Invalidate every authenticated read-model root so
        // a second tab cannot leave a customer, payment, cashbook, intake,
        // evidence or settings screen stale after a committed command.
        queryClient.invalidateQueries({ queryKey: trpc.account.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.audit.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.cash.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.customer.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.customerOrder.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.dashboard.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.delivery.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.document.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.evidence.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.intake.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.report.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.inventory.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.operations.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.payment.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.policy.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.pricing.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.product.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.sale.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.quality.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.purchase.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.receiving.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.session.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.supplier.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.supplyCommitment.pathKey() }),
      ]).then(() => undefined);
    const scheduler = createInvalidationScheduler(invalidate);
    let hasConnected = false;
    const disconnected = () => setLiveConnectionState("reconnecting");
    const markStaleAfterReconnectWindow = () => {
      if (hasConnected && !stopped) setLiveConnectionState("stale");
    };
    setLiveConnectionState("reconnecting");

    const read = async () => {
      while (!stopped) {
        try {
          const token = browserAccessToken();
          const response = await fetch(`/events?workspaceId=${encodeURIComponent(workspaceId)}`, {
            headers: token === null ? {} : { authorization: `Bearer ${token}` },
            cache: "no-store",
            signal: abort.signal,
          });
          if (!response.ok || response.body === null) throw new Error("events_unavailable");
          hasConnected = true;
          setLiveConnectionState("live");
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (!stopped) {
            const chunk = await reader.read();
            if (chunk.done) break;
            buffer += decoder.decode(chunk.value, { stream: true });
            const frames = buffer.split("\n\n");
            buffer = frames.pop() ?? "";
            for (const frame of frames) {
              const line = frame.split("\n").find((value) => value.startsWith("data: "));
              if (line === undefined) continue;
              const parsed = dashboardEventSchema.safeParse(JSON.parse(line.slice(6)));
              if (parsed.success && parsed.data.workspaceId === workspaceId) scheduler.request();
            }
          }
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
    };
    void read();
    return () => {
      stopped = true;
      abort.abort();
      scheduler.dispose();
    };
  }, [queryClient, trpc, workspaceId]);

  return null;
}
