import { beforeEach, describe, expect, it } from "vitest";
import { REPORT_TYPES, reportDefinitionsDtoSchema } from "@vuarau/domain-contracts";
import { OTHER_WORKSPACE_ID, WORKSPACE_ID } from "@vuarau/test-fixtures";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { getReportDefinitions } from "./report.queries.ts";

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
});

describe("report semantic definitions", () => {
  it("returns the versioned definitions through the authenticated read pipeline", async () => {
    const result = await getReportDefinitions(harness.ctx, { workspaceId: WORKSPACE_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(reportDefinitionsDtoSchema.safeParse(result.value).success).toBe(true);
    expect(result.value.definitions.map((definition) => definition.reportType)).toEqual(
      REPORT_TYPES,
    );
  });

  it("does not make static definitions a way around workspace authorization", async () => {
    const result = await getReportDefinitions(harness.ctx, { workspaceId: OTHER_WORKSPACE_ID });

    expect(result).toMatchObject({ ok: false, error: { code: "WORKSPACE_ACCESS_DENIED" } });
  });
});
