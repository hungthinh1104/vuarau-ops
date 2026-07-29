import type { Cursor, Page, WorkspaceId } from "@vuarau/domain-contracts";

export type WorkspacePageState<T> = {
  readonly workspaceId: WorkspaceId;
  readonly cursor: Cursor | null;
  readonly pages: readonly Page<T>[];
};

/**
 * A mounted route can survive an explicit workspace change. Old rows and their
 * cursor belong to the old authority scope and must disappear synchronously,
 * before the new query answers.
 */
export function pageStateForWorkspace<T>(
  state: WorkspacePageState<T>,
  workspaceId: WorkspaceId,
): WorkspacePageState<T> {
  return state.workspaceId === workspaceId ? state : { workspaceId, cursor: null, pages: [] };
}
