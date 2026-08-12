import { afterEach, describe, expect, it } from "vitest";
import {
  actorWorkspacesDtoSchema,
  sessionDtoSchema,
  workspaceIdSchema,
} from "@vuarau/domain-contracts";
import {
  cacheSession,
  cacheWorkspaces,
  cachedSession,
  cachedWorkspaces,
  clearOfflineSessionCache,
} from "./session-cache.ts";

const workspaceId = workspaceIdSchema.parse("00000000-0000-4000-8000-000000000001");
const actorId = "00000000-0000-4000-8000-000000000002";
const SUBJECT_A = "supabase-user-a";
const SUBJECT_B = "supabase-user-b";

// TC-OFFLINE-002
describe("offline session partition bootstrap", () => {
  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("restores validated server authority after a tab restart and clears it on sign-out", () => {
    const workspaces = actorWorkspacesDtoSchema.parse({
      actorId,
      workspaces: [
        {
          workspaceId,
          name: "Vựa thử",
          role: "sales",
          roles: ["sales"],
          permissions: ["sale.create", "sale.post", "sale.read"],
        },
      ],
    });
    const session = sessionDtoSchema.parse({
      actorId,
      workspaceId,
      role: "sales",
      roles: ["sales"],
      permissions: ["sale.create", "sale.post", "sale.read"],
    });
    cacheWorkspaces(SUBJECT_A, workspaces);
    cacheSession(SUBJECT_A, workspaceId, session);
    expect(cachedWorkspaces(SUBJECT_A)).toEqual(workspaces);
    expect(cachedSession(SUBJECT_A, workspaceId)).toEqual(session);
    expect(cachedWorkspaces(SUBJECT_B)).toBeNull();
    expect(cachedSession(SUBJECT_B, workspaceId)).toBeNull();
    window.localStorage.setItem("vuarau.offline.workspaces", "legacy-authority");
    window.sessionStorage.setItem(`vuarau.offline.session:${workspaceId}`, "legacy-authority");

    clearOfflineSessionCache(SUBJECT_A);
    expect(cachedWorkspaces(SUBJECT_A)).toBeNull();
    expect(cachedSession(SUBJECT_A, workspaceId)).toBeNull();
    expect(window.localStorage.getItem("vuarau.offline.workspaces")).toBeNull();
    expect(window.sessionStorage.getItem(`vuarau.offline.session:${workspaceId}`)).toBeNull();
  });

  it("fails closed when a persisted cache entry is malformed", () => {
    window.localStorage.setItem(
      `vuarau.offline.${encodeURIComponent(SUBJECT_A)}.session:${workspaceId}`,
      "not-json",
    );
    expect(cachedSession(SUBJECT_A, workspaceId)).toBeNull();
  });
});
