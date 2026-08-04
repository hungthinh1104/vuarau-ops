"use client";

import { useQueryClient } from "@tanstack/react-query";
import { dashboardEventSchema } from "@vuarau/domain-contracts";
import { useEffect } from "react";
import type { WorkspaceId } from "@vuarau/domain-contracts";
import { browserAccessToken } from "./access-token.ts";
import { useTRPC } from "./providers.tsx";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Refetches canonical queries after a server invalidation signal. */
export function LiveInvalidation({ workspaceId }: { readonly workspaceId: WorkspaceId }) {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  useEffect(() => {
    let stopped = false;
    const abort = new AbortController();
    const invalidate = () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.dashboard.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.report.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.inventory.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.sale.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.purchase.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.delivery.pathKey() }),
      ]);

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
              if (parsed.success && parsed.data.workspaceId === workspaceId) void invalidate();
            }
          }
        } catch {
          if (!stopped) await wait(3_000);
        }
      }
    };
    void read();
    return () => {
      stopped = true;
      abort.abort();
    };
  }, [queryClient, trpc, workspaceId]);

  return null;
}
