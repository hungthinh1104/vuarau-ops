import { beforeEach, describe, expect, it } from "vitest";
import { REPORT_TYPES, reportDefinitionsDtoSchema } from "@vuarau/domain-contracts";
import { ACTOR_ID, WORKSPACE_ID } from "@vuarau/test-fixtures";
import { createHarness, principalFor, type Harness } from "../../testing/command-test-harness.ts";
import { createTrustedContext } from "./context.ts";
import { appRouter } from "./router.ts";

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
});

describe("report definitions procedure", () => {
  it("publishes the semantic contract through tRPC", async () => {
    const caller = appRouter.createCaller(
      createTrustedContext(harness.deps, principalFor(ACTOR_ID)),
    );
    const definitions = await caller.report.definitions({ workspaceId: WORKSPACE_ID });

    expect(reportDefinitionsDtoSchema.safeParse(definitions).success).toBe(true);
    expect(definitions.definitions.map((definition) => definition.reportType)).toEqual(
      REPORT_TYPES,
    );
  });
});
