import { describe, expect, it } from "vitest";
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

describe("offline session partition bootstrap", () => {
  it("restores validated server authority for the same workspace and clears it on sign-out", () => {
    const workspaces = actorWorkspacesDtoSchema.parse({
      actorId,
      workspaces: [
        {
          workspaceId,
          name: "Vựa thử",
          role: "sales",
          permissions: ["sale.create", "sale.post", "sale.read"],
        },
      ],
    });
    const session = sessionDtoSchema.parse({
      actorId,
      workspaceId,
      role: "sales",
      permissions: ["sale.create", "sale.post", "sale.read"],
    });
    cacheWorkspaces(workspaces);
    cacheSession(workspaceId, session);
    expect(cachedWorkspaces()).toEqual(workspaces);
    expect(cachedSession(workspaceId)).toEqual(session);

    clearOfflineSessionCache();
    expect(cachedWorkspaces()).toBeNull();
    expect(cachedSession(workspaceId)).toBeNull();
  });
});
