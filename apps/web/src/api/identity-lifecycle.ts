import type { QueryClient } from "@tanstack/react-query";
import { clearOfflineSessionCache } from "../offline/session-cache.ts";
import { clearWorkspaceSelection } from "./workspace.ts";

let activeQueryClient: QueryClient | null = null;

/**
 * Registers the query cache owned by the currently rendered authentication
 * subject. There is only one application tree per tab, so one active client is
 * the correct cardinality.
 */
export function registerIdentityQueryClient(queryClient: QueryClient): () => void {
  activeQueryClient = queryClient;
  return () => {
    if (activeQueryClient !== queryClient) return;
    void queryClient.cancelQueries();
    queryClient.clear();
    activeQueryClient = null;
  };
}

/** Cancel in-flight API work before making the previous identity unreachable. */
export async function clearIdentityQueryState(): Promise<void> {
  const queryClient = activeQueryClient;
  if (queryClient === null) return;
  await queryClient.cancelQueries();
  queryClient.clear();
}

/**
 * Removes browser authority derived for one Supabase subject.
 *
 * Durable offline business commands live in their actor/workspace partition and
 * are deliberately not deleted here. SessionDto, permissions and workspace
 * selection are authority caches, so they must never cross an identity boundary.
 */
export function clearIdentityBrowserState(subject: string): void {
  clearOfflineSessionCache(subject);
  clearWorkspaceSelection(subject);
}
