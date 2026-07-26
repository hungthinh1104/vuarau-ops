import { describe, expect, it } from "vitest";
import { configuredWorkspaces } from "./workspace.ts";
import { setAccessToken, browserAccessToken, TOKEN_KEY } from "./access-token.ts";

/**
 * TC-WEB-017 — the workspace list is configured, and parsed rather than trusted.
 *
 * Every command and read is scoped by `workspaceId` (BR-CUSTOMER-002), so this
 * string decides which set of books the app writes into. A malformed environment
 * variable must produce **no** choices and an honest "chưa cấu hình", not a
 * uuid-shaped fragment sent to the server as a tenant boundary.
 */
describe("TC-WEB-017 — configured workspaces", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";

  it("parses id:name pairs separated by a pipe", () => {
    expect(configuredWorkspaces(`${id}:Vựa Ba Hưng|${other}:Vựa Sáu Tâm`)).toEqual([
      { workspaceId: id, displayName: "Vựa Ba Hưng" },
      { workspaceId: other, displayName: "Vựa Sáu Tâm" },
    ]);
  });

  it("keeps Vietnamese names and colons inside them intact", () => {
    expect(configuredWorkspaces(`${id}:Vựa Ba Hưng: chợ Bình Điền`)).toEqual([
      { workspaceId: id, displayName: "Vựa Ba Hưng: chợ Bình Điền" },
    ]);
  });

  it("drops an entry whose id is not a uuid, rather than passing it on", () => {
    expect(configuredWorkspaces(`not-a-uuid:Vựa|${id}:Vựa thật`)).toEqual([
      { workspaceId: id, displayName: "Vựa thật" },
    ]);
  });

  it("drops an entry with no name", () => {
    expect(configuredWorkspaces(`${id}:`)).toEqual([]);
    expect(configuredWorkspaces(id)).toEqual([]);
  });

  it("treats absent or blank configuration as no choices at all", () => {
    expect(configuredWorkspaces(undefined)).toEqual([]);
    expect(configuredWorkspaces("   ")).toEqual([]);
  });
});

/**
 * TC-WEB-018 — the access token is read fresh on every request.
 *
 * A token captured once at mount expires mid-shift, and the failure looks to a
 * worker like being randomly signed out. `sessionStorage`, not `localStorage`: a
 * depot phone gets handed around, and a token that outlives the tab is one the
 * next person inherits.
 */
describe("TC-WEB-018 — access token source", () => {
  it("reads whatever is in session storage at the moment it is asked", () => {
    setAccessToken(null);
    expect(browserAccessToken()).toBeNull();

    setAccessToken("first-token");
    expect(browserAccessToken()).toBe("first-token");

    // A refresh replaces it, and the next call sees the new one with no wiring.
    setAccessToken("refreshed-token");
    expect(browserAccessToken()).toBe("refreshed-token");

    setAccessToken(null);
    expect(browserAccessToken()).toBeNull();
    expect(window.sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});
