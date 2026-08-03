import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import type { WorkspacePolicyVersionId } from "@vuarau/domain-contracts";
import { randomIdGenerator } from "../../clock.ts";
import {
  approveWorkspacePolicy,
  createWorkspacePolicyDraft,
} from "../../../modules/policy/policy.handlers.ts";
import { getManagementIntelligence } from "../../../modules/report/management-intelligence.queries.ts";

describe.skipIf(skipWithoutDatabase())("management intelligence against PostgreSQL", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;

  const context = (): CommandContext => ({
    deps,
    principal: { actorId: ctx.actorId, subject: ctx.subject },
  });

  const command = (label: string) => ({
    commandId: crypto.randomUUID(),
    idempotencyKey: `management-intelligence-db-${label}-${crypto.randomUUID()}`,
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
    occurredAt: "2026-08-04T05:00:00.000Z",
  });

  beforeEach(async () => {
    ctx = await createDbTestContext(`management-intelligence-${crypto.randomUUID()}`);
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => "2026-08-04T09:00:00.000Z" as never },
    };
  });

  afterEach(async () => {
    await ctx?.close();
  });

  it("TC-REPORT-004 preserves policy lineage and source report types on PostgreSQL", async () => {
    const policyVersionId = crypto.randomUUID() as WorkspacePolicyVersionId;
    expect(
      (
        await createWorkspacePolicyDraft(context(), {
          ...command("policy-draft"),
          payload: {
            policyVersionId,
            policyKind: "management_intelligence",
            version: 1,
            effectiveFrom: "2026-08-01T00:00:00.000Z",
            effectiveTo: null,
            definition: {
              contractVersion: 1,
              parameters: {
                strategy: "operational_report_snapshot",
                reportTypes: ["cash_balances", "inventory_by_product_unit"],
              },
            },
            evidenceReferences: [],
            reason: "PostgreSQL report source snapshot.",
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await approveWorkspacePolicy(context(), {
          ...command("policy-approve"),
          payload: {
            policyVersionId,
            evidenceReferences: ["field://management-intelligence/postgres-001"],
            reason: "Đã duyệt nguồn report và policy version.",
          },
        })
      ).ok,
    ).toBe(true);

    const result = await getManagementIntelligence(context(), {
      workspaceId: ctx.workspaceId,
      asOf: "2026-08-04T09:00:00.000Z",
      businessDate: null,
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        status: "available",
        policyVersionId,
        policyVersion: 1,
        sourceReportTypes: ["cash_balances", "inventory_by_product_unit"],
      },
    });
  });
});
