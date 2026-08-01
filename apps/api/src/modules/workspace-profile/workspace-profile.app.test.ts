import { beforeEach, describe, expect, it } from "vitest";
import {
  ACTOR_ID,
  SALES_ACTOR_ID,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { createSupplier } from "../supplier/supplier.handlers.ts";
import {
  getWorkspaceOperationalProfile,
  updateWorkspaceOperationalProfile,
} from "./workspace-profile.ts";

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
});

const envelope = (key: string, actorId = ACTOR_ID) => ({
  commandId: crypto.randomUUID(),
  idempotencyKey: key,
  workspaceId: WORKSPACE_ID,
  actorId,
  occurredAt: "2026-07-20T05:00:00.000Z",
});

const disabledProfileCommand = (key: string) => ({
  ...envelope(key),
  expectedVersion: 1,
  payload: {
    purchasingMode: "disabled" as const,
    inventoryMode: "disabled" as const,
    qualityGradeMode: "disabled" as const,
    deliveryMode: "disabled" as const,
    businessDayStartMinute: 22 * 60,
    reason: "Vựa chỉ dùng bán hàng, thu tiền và công nợ",
  },
});

describe("workspace operational profile", () => {
  it("returns the current full-depot default without client-side assumptions", async () => {
    const result = await getWorkspaceOperationalProfile(harness.ctx, WORKSPACE_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      workspaceId: WORKSPACE_ID,
      version: 1,
      purchasingMode: "purchase_receiving",
      inventoryMode: "movement_ledger",
      qualityGradeMode: "required",
      deliveryMode: "sale_fulfilment",
      businessDayStartMinute: 0,
    });
  });

  it("lets an owner replace the complete profile and safely replays the same intent", async () => {
    const command = disabledProfileCommand("profile-disable-operations");
    const first = await updateWorkspaceOperationalProfile(harness.ctx, command);
    const replay = await updateWorkspaceOperationalProfile(harness.ctx, command);
    expect(first.ok).toBe(true);
    expect(replay).toEqual(first);
    expect(first.ok && first.value.version).toBe(2);
    expect(harness.db.auditRecords().at(-1)?.action).toBe(
      "workspace.operational_profile_updated",
    );
  });

  it("keeps profile changes owner-only", async () => {
    const command = {
      ...disabledProfileCommand("profile-sales-denied"),
      actorId: SALES_ACTOR_ID,
    };
    const result = await updateWorkspaceOperationalProfile(
      harness.contextFor(SALES_ACTOR_ID),
      command,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PERMISSION_DENIED");
  });

  it("blocks new purchasing commands while retaining the existing workflow history", async () => {
    const changed = await updateWorkspaceOperationalProfile(
      harness.ctx,
      disabledProfileCommand("profile-before-supplier"),
    );
    expect(changed.ok).toBe(true);

    const result = await createSupplier(harness.ctx, {
      ...envelope("supplier-while-purchasing-disabled"),
      payload: {
        supplierId: crypto.randomUUID(),
        displayName: "Nhà vườn mới",
        phone: null,
        note: null,
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({
      code: "WORKSPACE_WORKFLOW_DISABLED",
      details: { workflow: "purchasing" },
    });
  });
});
