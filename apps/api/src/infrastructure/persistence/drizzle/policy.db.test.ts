import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
import {
  approveWorkspacePolicy,
  createWorkspacePolicyDraft,
} from "../../../modules/policy/policy.handlers.ts";
import {
  getWorkspacePolicy,
  getWorkspacePolicyAvailability,
} from "../../../modules/policy/policy.queries.ts";

describe.skipIf(skipWithoutDatabase())("workspace policies against PostgreSQL", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;

  const context = (): CommandContext => ({
    deps,
    principal: { actorId: ctx.actorId, subject: ctx.subject },
  });

  const envelope = (label: string) => ({
    commandId: crypto.randomUUID(),
    idempotencyKey: `${label}-${crypto.randomUUID()}`,
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
    occurredAt: "2026-08-03T01:00:00.000Z",
  });

  beforeEach(async () => {
    ctx = await createDbTestContext(`workspace-policy-${crypto.randomUUID()}`);
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => "2026-08-03T01:00:00.000Z" as never },
    };
  });

  afterEach(async () => {
    await ctx?.close();
  });

  it("TC-POLICY-004 persists a draft, approval evidence and effective availability", async () => {
    const policyVersionId = crypto.randomUUID();
    const draft = await createWorkspacePolicyDraft(context(), {
      ...envelope("draft"),
      payload: {
        policyVersionId,
        policyKind: "inventory_valuation",
        version: 1,
        effectiveFrom: "2026-08-01T00:00:00.000Z",
        effectiveTo: null,
        definition: { contractVersion: 1, parameters: { basis: "field-review" } },
        evidenceReferences: [],
        reason: "Bản nháp policy valuation.",
      },
    });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;

    const readDraft = await getWorkspacePolicy(context(), {
      workspaceId: ctx.workspaceId,
      policyVersionId: draft.value.id,
    });
    expect(readDraft.ok).toBe(true);
    if (readDraft.ok) expect(readDraft.value.state).toBe("draft");

    const approved = await approveWorkspacePolicy(context(), {
      ...envelope("approve"),
      payload: {
        policyVersionId: draft.value.id,
        evidenceReferences: ["field://valuation/001"],
        reason: "Đã được duyệt có evidence.",
      },
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.value.state).toBe("approved");
    expect(approved.value.evidenceReferences).toEqual(["field://valuation/001"]);

    const availability = await getWorkspacePolicyAvailability(context(), {
      workspaceId: ctx.workspaceId,
      asOf: "2026-08-03T00:00:00.000Z",
    });
    expect(availability.ok).toBe(true);
    if (availability.ok) {
      expect(
        availability.value.find((entry) => entry.policyKind === "inventory_valuation"),
      ).toMatchObject({
        availability: "available",
        version: 1,
      });
    }
  });
});
