import { beforeEach, describe, expect, it } from "vitest";
import {
  REPORT_TYPES,
  managementIntelligenceDtoSchema,
  reportDefinitionsDtoSchema,
  reportMetricDefinitionsDtoSchema,
} from "@vuarau/domain-contracts";
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

  it("publishes policy-blocked and descriptive metric availability through tRPC", async () => {
    const caller = appRouter.createCaller(
      createTrustedContext(harness.deps, principalFor(ACTOR_ID)),
    );
    const metrics = await caller.report.metrics({ workspaceId: WORKSPACE_ID });

    expect(reportMetricDefinitionsDtoSchema.safeParse(metrics).success).toBe(true);
    expect(
      metrics.definitions
        .filter((definition) => definition.metricId !== "supplier_performance")
        .every((definition) => definition.availability === "unavailable"),
    ).toBe(true);
    expect(
      metrics.definitions.find((definition) => definition.metricId === "supplier_performance"),
    ).toMatchObject({ availability: "available" });
  });

  it("publishes management intelligence as unavailable without an effective policy", async () => {
    const caller = appRouter.createCaller(
      createTrustedContext(harness.deps, principalFor(ACTOR_ID)),
    );
    const intelligence = await caller.report.intelligence({
      workspaceId: WORKSPACE_ID,
      asOf: "2026-08-04T09:00:00.000Z",
      businessDate: null,
    });

    expect(managementIntelligenceDtoSchema.safeParse(intelligence).success).toBe(true);
    expect(intelligence).toMatchObject({
      status: "unavailable",
      diagnostics: ["no_effective_management_intelligence_policy"],
      indicators: [],
    });
  });
});
