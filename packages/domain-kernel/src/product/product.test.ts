import { describe, expect, it } from "vitest";
import {
  createProductCommandSchema,
  deactivateProductCommandSchema,
  updateProductCommandSchema,
  type IsoInstant,
} from "@vuarau/domain-contracts";
import {
  ACTOR_ID,
  COMMAND_ID,
  IDEMPOTENCY_KEY,
  LATER_TRANSACTION_TIME,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
import { decideCreateProduct, decideProductLifecycle, decideUpdateProduct } from "./index.ts";

const recordedAt = "2026-01-02T03:04:05.000Z" as IsoInstant;
const productId = "00000000-0000-4000-8000-000000000701";

const createCommand = () =>
  createProductCommandSchema.parse({
    commandId: COMMAND_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt: LATER_TRANSACTION_TIME,
    payload: {
      productId,
      displayName: "  Cà chua Đà Lạt  ",
      aliases: ["ca chua", "ca chua", "  ", "Cà chua Đà Lạt"],
      preferredUnit: "kg",
    },
  });

describe("Product decisions", () => {
  it("creates a stable active identity and canonicalizes names", () => {
    const result = decideCreateProduct(createCommand(), recordedAt);
    expect(result.ok && result.value).toMatchObject({
      id: productId,
      displayName: "Cà chua Đà Lạt",
      aliases: ["ca chua"],
      preferredUnit: "kg",
      isActive: true,
      version: 1,
    });
  });

  it("rejects a stale update without changing the current product", () => {
    const created = decideCreateProduct(createCommand(), recordedAt);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const command = updateProductCommandSchema.parse({
      ...createCommand(),
      commandId: "00000000-0000-4000-8000-000000000702",
      idempotencyKey: "product-update-stale-key",
      expectedVersion: 2,
      payload: {
        productId,
        displayName: "Cà chua bi",
        aliases: [],
        preferredUnit: "kg",
      },
    });
    const result = decideUpdateProduct(created.value, command, recordedAt);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PRODUCT_VERSION_CONFLICT");
    expect(created.value).toMatchObject({ displayName: "Cà chua Đà Lạt", version: 1 });
  });

  it("uses named lifecycle transitions and refuses a duplicate transition", () => {
    const created = decideCreateProduct(createCommand(), recordedAt);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const command = deactivateProductCommandSchema.parse({
      ...createCommand(),
      commandId: "00000000-0000-4000-8000-000000000703",
      idempotencyKey: "product-deactivate-key",
      expectedVersion: 1,
      payload: { productId, reason: "Hết mùa" },
    });
    const deactivated = decideProductLifecycle(created.value, command, false, recordedAt);
    expect(deactivated.ok && deactivated.value).toMatchObject({ isActive: false, version: 2 });
    if (!deactivated.ok) return;
    const repeated = decideProductLifecycle(
      deactivated.value,
      { ...command, expectedVersion: 2 },
      false,
      recordedAt,
    );
    expect(repeated.ok).toBe(false);
    if (!repeated.ok) expect(repeated.error.code).toBe("INVALID_COMMAND_PAYLOAD");
  });
});
