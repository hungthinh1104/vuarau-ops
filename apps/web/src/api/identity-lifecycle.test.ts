import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WORKSPACE_ID } from "@vuarau/test-fixtures/ids";
import {
  clearIdentityBrowserState,
  clearIdentityQueryState,
  registerIdentityQueryClient,
} from "./identity-lifecycle.ts";
import { storeWorkspaceId, storedWorkspaceId } from "./workspace.ts";
import { cacheSession, cachedSession } from "@/offline/session-cache.ts";
import { salesSession } from "@/fixtures/session.fixtures.ts";

const SUBJECT_A = "supabase-user-a";
const SUBJECT_B = "supabase-user-b";

describe("TC-WEB-027 — authentication-subject cleanup", () => {
  afterEach(() => window.sessionStorage.clear());

  it("cancels and clears the old identity query cache", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["actor-sensitive"], { actor: "A" });
    const cancel = vi.spyOn(queryClient, "cancelQueries");
    const unregister = registerIdentityQueryClient(queryClient);

    await clearIdentityQueryState();

    expect(cancel).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(["actor-sensitive"])).toBeUndefined();
    unregister();
  });

  it("clears A authority caches without touching B's subject partition", () => {
    storeWorkspaceId(SUBJECT_A, WORKSPACE_ID);
    storeWorkspaceId(SUBJECT_B, WORKSPACE_ID);
    cacheSession(SUBJECT_A, WORKSPACE_ID, salesSession);
    cacheSession(SUBJECT_B, WORKSPACE_ID, salesSession);

    clearIdentityBrowserState(SUBJECT_A);

    expect(storedWorkspaceId(SUBJECT_A)).toBeNull();
    expect(cachedSession(SUBJECT_A, WORKSPACE_ID)).toBeNull();
    expect(storedWorkspaceId(SUBJECT_B)).toBe(WORKSPACE_ID);
    expect(cachedSession(SUBJECT_B, WORKSPACE_ID)).toEqual(salesSession);
  });
});
