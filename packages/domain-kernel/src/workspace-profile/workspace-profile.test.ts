import { describe, expect, it } from "vitest";
import {
  defaultWorkspaceOperationalProfile,
  updateWorkspaceOperationalProfileCommandSchema,
  workspaceIdSchema,
} from "@vuarau/domain-contracts";
import { decideUpdateWorkspaceOperationalProfile } from "./index.ts";

const workspaceId = workspaceIdSchema.parse("11111111-1111-4111-8111-111111111111");
const current = defaultWorkspaceOperationalProfile(workspaceId);

const command = (overrides: Record<string, unknown> = {}) =>
  updateWorkspaceOperationalProfileCommandSchema.parse({
    commandId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    workspaceId,
    actorId: "22222222-2222-4222-8222-222222222222",
    occurredAt: "2026-08-01T15:00:00.000Z",
    expectedVersion: 1,
    payload: {
      purchasingMode: "disabled",
      inventoryMode: "disabled",
      qualityGradeMode: "disabled",
      deliveryMode: "disabled",
      businessDayStartMinute: 22 * 60,
      reason: "Vựa chỉ dùng sổ bán hàng và công nợ",
    },
    ...overrides,
  });

describe("workspace operational profile", () => {
  it("replaces the complete policy atomically and records an audit summary", () => {
    const result = decideUpdateWorkspaceOperationalProfile({
      command: command(),
      current,
      recordedAt: "2026-08-01T15:00:01.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.profile).toMatchObject({
      version: 2,
      purchasingMode: "disabled",
      inventoryMode: "disabled",
      qualityGradeMode: "disabled",
      deliveryMode: "disabled",
      businessDayStartMinute: 1320,
    });
    expect(result.value.audit).toMatchObject({
      action: "workspace.operational_profile_updated",
      before: { version: 1, inventoryMode: "movement_ledger" },
      after: { version: 2, inventoryMode: "disabled" },
    });
  });

  it("refuses a stale complete profile rather than merging individual flags", () => {
    const result = decideUpdateWorkspaceOperationalProfile({
      command: command({ expectedVersion: 0 }),
      current,
      recordedAt: "2026-08-01T15:00:01.000Z",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("WORKSPACE_PROFILE_VERSION_CONFLICT");
  });

  it("refuses a no-op policy update", () => {
    const result = decideUpdateWorkspaceOperationalProfile({
      command: updateWorkspaceOperationalProfileCommandSchema.parse({
        ...command(),
        payload: { ...current, reason: "Không có thay đổi" },
      }),
      current,
      recordedAt: "2026-08-01T15:00:01.000Z",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("WORKSPACE_PROFILE_UNCHANGED");
  });

  it("rejects an impossible workflow combination at the contract boundary", () => {
    const parsed = updateWorkspaceOperationalProfileCommandSchema.safeParse({
      ...command(),
      payload: {
        purchasingMode: "purchase_receiving",
        inventoryMode: "disabled",
        qualityGradeMode: "disabled",
        deliveryMode: "disabled",
        businessDayStartMinute: 0,
        reason: "Tổ hợp không hợp lệ",
      },
    });
    expect(parsed.success).toBe(false);
  });
});
