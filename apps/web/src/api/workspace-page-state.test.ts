import { describe, expect, it } from "vitest";
import type { Cursor } from "@vuarau/domain-contracts";
import { OTHER_WORKSPACE_ID, WORKSPACE_ID } from "@vuarau/test-fixtures/ids";
import { pageStateForWorkspace } from "./workspace-page-state.ts";

describe("TC-WEB-030 — paged reads stay inside the selected workspace", () => {
  it("drops both visible rows and cursor synchronously on workspace change", () => {
    const old = {
      workspaceId: WORKSPACE_ID,
      cursor: "old-cursor" as Cursor,
      pages: [
        {
          items: [{ id: "workspace-a-only" }],
          nextCursor: "old-cursor" as Cursor,
        },
      ],
    };
    expect(pageStateForWorkspace(old, OTHER_WORKSPACE_ID)).toEqual({
      workspaceId: OTHER_WORKSPACE_ID,
      cursor: null,
      pages: [],
    });
  });
});
