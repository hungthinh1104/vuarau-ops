import { afterEach, describe, expect, it } from "vitest";
import { actorWorkspacesDtoSchema } from "@vuarau/domain-contracts";
import { clearWorkspaceSelection, storeWorkspaceId, storedWorkspaceId } from "./workspace.ts";
import { setAccessToken, browserAccessToken, TOKEN_KEY } from "./access-token.ts";
import { ownerWorkspaces } from "@/fixtures/session.fixtures.ts";
import { WORKSPACE_ID } from "@vuarau/test-fixtures/ids";

const SUBJECT_A = "supabase-user-a";
const SUBJECT_B = "supabase-user-b";

/**
 * TC-WEB-017 — the depot list comes from the server, and the selection is a
 * stored id that is validated rather than trusted.
 *
 * This used to test `NEXT_PUBLIC_WORKSPACES`, a build-time variable naming ids and
 * labels. That variable is gone: which depots a person may enter is a claim only
 * the server can make (BR-AUTH-008), and a client that also holds a list holds a
 * second answer to the same question.
 *
 * What is left in the browser is the **selection** — which of the server's depots
 * this tab is working in — and it is a `workspaceId`, so it is parsed on the way
 * out of storage. A uuid-shaped fragment from a stale tab must not become a tenant
 * boundary (BR-CUSTOMER-002).
 */
describe("TC-WEB-017 — the depot list and the stored selection", () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("takes the list from the server's own answer, parsed against the contract", () => {
    // The fixture is what `session.workspaces` returns. Parsing it here means a
    // DTO that drifts breaks this test rather than the picker.
    const parsed = actorWorkspacesDtoSchema.parse(ownerWorkspaces);
    expect(parsed.workspaces.map((workspace) => workspace.name)).toHaveLength(2);
    expect(parsed.workspaces[0]?.role).toBe("owner");
    // The second depot is the same person in a different role, which is why the
    // permission set travels per depot and not per session.
    expect(parsed.workspaces[1]?.role).toBe("sales");
    expect(parsed.workspaces[1]?.permissions).not.toContain("sale.void");
  });

  it("round-trips a chosen depot for the life of the tab", () => {
    expect(storedWorkspaceId(SUBJECT_A)).toBeNull();
    storeWorkspaceId(SUBJECT_A, WORKSPACE_ID);
    expect(storedWorkspaceId(SUBJECT_A)).toBe(WORKSPACE_ID);
    storeWorkspaceId(SUBJECT_A, null);
    expect(storedWorkspaceId(SUBJECT_A)).toBeNull();
  });

  it("refuses a stored value that is not a workspace id", () => {
    window.sessionStorage.setItem(
      `vuarau.workspace_id:${encodeURIComponent(SUBJECT_A)}`,
      "not-a-uuid",
    );
    expect(storedWorkspaceId(SUBJECT_A)).toBeNull();
  });

  it("does not expose one subject's selection to another and clears it on logout", () => {
    storeWorkspaceId(SUBJECT_A, WORKSPACE_ID);
    expect(storedWorkspaceId(SUBJECT_B)).toBeNull();
    clearWorkspaceSelection(SUBJECT_A);
    expect(storedWorkspaceId(SUBJECT_A)).toBeNull();
  });
});

/**
 * TC-WEB-018 — the access token is the one Supabase currently holds.
 *
 * A token captured once at mount expires mid-shift, and the failure looks to a
 * worker like being randomly signed out. So it is read on every request, from the
 * value the auth provider keeps current — never from a copy in storage that would
 * outlive a sign-out.
 */
describe("TC-WEB-018 — access token source", () => {
  afterEach(() => {
    setAccessToken(null);
    window.sessionStorage.clear();
    delete process.env["NEXT_PUBLIC_E2E_AUTH_BRIDGE"];
  });

  it("returns whatever the auth provider last set", () => {
    setAccessToken(null);
    expect(browserAccessToken()).toBeNull();

    setAccessToken("first-token");
    expect(browserAccessToken()).toBe("first-token");

    // A refresh replaces it, and the next call sees the new one with no wiring.
    setAccessToken("refreshed-token");
    expect(browserAccessToken()).toBe("refreshed-token");

    setAccessToken(null);
    expect(browserAccessToken()).toBeNull();
  });
});

/**
 * TC-WEB-024 — the end-to-end token bridge is off unless a build turns it on.
 *
 * Playwright runs against a real API and a real database but no Supabase project,
 * so the harness writes a minted token into `sessionStorage`. That door has to
 * exist; what must not exist is the same door in a normal build, where anything
 * able to write one key would be able to authenticate.
 *
 * "Off by default" is one line to break by accident, which is why it is asserted
 * rather than commented.
 */
describe("TC-WEB-024 — the E2E token bridge", () => {
  afterEach(() => {
    setAccessToken(null);
    window.sessionStorage.clear();
    delete process.env["NEXT_PUBLIC_E2E_AUTH_BRIDGE"];
  });

  it("ignores an injected token when the bridge is not enabled", () => {
    setAccessToken(null);
    window.sessionStorage.setItem(TOKEN_KEY, "injected-by-something-else");
    expect(browserAccessToken()).toBeNull();
  });

  it("reads an injected token only when the build enabled the bridge", () => {
    setAccessToken(null);
    process.env["NEXT_PUBLIC_E2E_AUTH_BRIDGE"] = "1";
    window.sessionStorage.setItem(TOKEN_KEY, "minted-for-the-harness");
    expect(browserAccessToken()).toBe("minted-for-the-harness");
  });

  it("prefers a real session over the bridge when both are present", () => {
    // Belt and braces: even in a harness build, a signed-in session wins, so the
    // bridge can never shadow a real identity.
    process.env["NEXT_PUBLIC_E2E_AUTH_BRIDGE"] = "1";
    window.sessionStorage.setItem(TOKEN_KEY, "minted-for-the-harness");
    setAccessToken("real-supabase-token");
    expect(browserAccessToken()).toBe("real-supabase-token");
  });
});
