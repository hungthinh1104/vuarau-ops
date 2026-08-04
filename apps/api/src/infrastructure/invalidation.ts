import type { Database } from "@vuarau/db";
import {
  dashboardEventSchema,
  type DashboardEvent,
  type WorkspaceId,
} from "@vuarau/domain-contracts";

const CHANNEL = "vuarau_dashboard_invalidations";

export type InvalidationBus = {
  readonly publish: (event: DashboardEvent) => Promise<void>;
  readonly subscribe: (
    workspaceId: WorkspaceId,
    listener: (event: DashboardEvent) => void,
  ) => () => void;
};

/**
 * LISTEN/NOTIFY is deliberately an invalidation transport, not a cache. If a
 * notification is missed, the next normal query still reads canonical facts.
 */
export function createInvalidationBus(sql: Database["sql"]): InvalidationBus {
  const listeners = new Map<string, Set<(event: DashboardEvent) => void>>();
  void sql.listen(CHANNEL, (payload) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }
    const event = dashboardEventSchema.safeParse(parsed);
    if (!event.success) return;
    for (const listener of listeners.get(event.data.workspaceId) ?? []) listener(event.data);
  });

  return {
    publish: async (event) => {
      await sql.notify(CHANNEL, JSON.stringify(event));
    },
    subscribe: (workspaceId, listener) => {
      const current = listeners.get(workspaceId) ?? new Set();
      current.add(listener);
      listeners.set(workspaceId, current);
      return () => {
        current.delete(listener);
        if (current.size === 0) listeners.delete(workspaceId);
      };
    },
  };
}
