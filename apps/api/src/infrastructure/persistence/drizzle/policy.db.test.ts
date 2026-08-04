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
  retireWorkspacePolicy,
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
        definition: {
          contractVersion: 1,
          parameters: { strategy: "moving_weighted_average" },
        },
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

  it("TC-POLICY-014 preserves historical availability after PostgreSQL retirement", async () => {
    const draft = await createWorkspacePolicyDraft(context(), {
      ...envelope("historical-draft"),
      payload: {
        policyVersionId: crypto.randomUUID(),
        policyKind: "inventory_valuation",
        version: 1,
        effectiveFrom: "2026-08-01T00:00:00.000Z",
        effectiveTo: null,
        definition: {
          contractVersion: 1,
          parameters: { strategy: "moving_weighted_average" },
        },
        evidenceReferences: [],
        reason: "Policy lịch sử.",
      },
    });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    const approved = await approveWorkspacePolicy(context(), {
      ...envelope("historical-approve"),
      payload: {
        policyVersionId: draft.value.id,
        evidenceReferences: ["field://valuation/historical"],
        reason: "Đã duyệt policy lịch sử.",
      },
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;

    const retired = await retireWorkspacePolicy(context(), {
      ...envelope("historical-retire"),
      payload: { policyVersionId: approved.value.id, reason: "Thay policy mới." },
    });
    expect(retired.ok).toBe(true);
    if (!retired.ok) return;

    const historical = await getWorkspacePolicyAvailability(context(), {
      workspaceId: ctx.workspaceId,
      asOf: "2026-08-02T00:00:00.000Z",
    });
    expect(historical.ok).toBe(true);
    if (historical.ok) {
      expect(
        historical.value.find((entry) => entry.policyKind === "inventory_valuation"),
      ).toMatchObject({
        availability: "available",
        version: 1,
      });
    }

    const current = await getWorkspacePolicyAvailability(context(), {
      workspaceId: ctx.workspaceId,
      asOf: "2026-08-04T00:00:00.000Z",
    });
    expect(current.ok).toBe(true);
    if (current.ok) {
      expect(
        current.value.find((entry) => entry.policyKind === "inventory_valuation"),
      ).toMatchObject({
        availability: "unavailable",
        reason: "effective_window_closed",
      });
    }
  });

  it("TC-POLICY-015 rejects overlapping PostgreSQL approvals", async () => {
    const create = (label: string, version: number, effectiveFrom: string) =>
      createWorkspacePolicyDraft(context(), {
        ...envelope(label),
        payload: {
          policyVersionId: crypto.randomUUID(),
          policyKind: "inventory_valuation" as const,
          version,
          effectiveFrom,
          effectiveTo: null,
          definition: {
            contractVersion: 1 as const,
            parameters: { strategy: "moving_weighted_average" as const },
          },
          evidenceReferences: [],
          reason: "Kiểm tra cửa sổ policy.",
        },
      });
    const first = await create("overlap-draft-1", 1, "2026-08-01T00:00:00.000Z");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const firstApproval = await approveWorkspacePolicy(context(), {
      ...envelope("overlap-approve-1"),
      payload: {
        policyVersionId: first.value.id,
        evidenceReferences: ["field://valuation/overlap-1"],
        reason: "Policy đầu tiên.",
      },
    });
    expect(firstApproval.ok).toBe(true);

    const second = await create("overlap-draft-2", 2, "2026-08-02T00:00:00.000Z");
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const secondApproval = await approveWorkspacePolicy(context(), {
      ...envelope("overlap-approve-2"),
      payload: {
        policyVersionId: second.value.id,
        evidenceReferences: ["field://valuation/overlap-2"],
        reason: "Không cho phép chồng cửa sổ.",
      },
    });
    expect(secondApproval.ok).toBe(false);
    if (!secondApproval.ok) {
      expect(secondApproval.error.code).toBe("WORKSPACE_POLICY_EFFECTIVE_OVERLAP");
    }
  });
});
