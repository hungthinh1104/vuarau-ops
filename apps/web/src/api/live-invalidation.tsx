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
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let queued = false;
  let disposed = false;

  const schedule = () => {
    if (disposed || timer !== null || retryTimer !== null || running) return;
    timer = setTimeout(() => {
      timer = null;
      if (disposed || !queued) return;
      queued = false;
      running = true;
      void invalidate()
        .catch(() => {
          if (!disposed) {
            queued = true;
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
    request: () => {
      if (disposed) return;
      queued = true;
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

/** Refetches canonical queries after a server invalidation signal. */
export function LiveInvalidation({ workspaceId }: { readonly workspaceId: WorkspaceId }) {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  useEffect(() => {
    let stopped = false;
    const abort = new AbortController();
    const invalidate = async () => {
      try {
        await Promise.all([
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
        ]);
        setLiveConnectionState("live");
      } catch (error) {
        setLiveConnectionState("stale");
        throw error;
      }
    };
    const scheduler = createInvalidationScheduler(invalidate);
    // LISTEN/NOTIFY is a hint, not a durable queue. Periodic reconciliation
    // closes the gap when a post-commit publish was lost or a tab missed an
    // event while reconnecting.
    const reconciliation = setInterval(() => scheduler.request(), 60_000);
    let hasConnected = false;
    const disconnected = () => setLiveConnectionState("reconnecting");
    const markStaleAfterReconnectWindow = () => {
      if (hasConnected && !stopped) setLiveConnectionState("stale");
    };
    setLiveConnectionState("reconnecting");

    const read = async () => {
      let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
      const watchdog = setInterval(() => {
        if (activeReader !== null && Date.now() - lastByteAt > 60_000) {
          setLiveConnectionState("stale");
          void activeReader.cancel();
        }
      }, 10_000);
      let lastByteAt = Date.now();
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
          const reader = response.body.getReader();
          activeReader = reader;
          lastByteAt = Date.now();
          if (wasConnected) {
            setLiveConnectionState("stale");
            try {
              await invalidate();
            } catch {
              // The scheduler retries the canonical refresh while the stream
              // remains connected; live status is restored only after success.
              scheduler.request();
            }
          } else {
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
              if (parsed.success && parsed.data.workspaceId === workspaceId) scheduler.request();
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
      // The watchdog owns the active reader and cancels it when a half-open
      // connection stops delivering bytes; aborting the fetch handles cleanup
      // before the first reader exists.
      scheduler.dispose();
      clearInterval(reconciliation);
    };
  }, [queryClient, trpc, workspaceId]);

  return null;
}
