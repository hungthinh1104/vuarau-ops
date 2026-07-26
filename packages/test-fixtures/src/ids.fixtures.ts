import type {
  ActorId,
  CommandId,
  CustomerId,
  CustomerAccountEntryId,
  IdempotencyKey,
  SaleId,
  SaleVoidId,
  SaleLineId,
  PaymentId,
  PaymentReversalId,
  ProductId,
  WorkspaceId,
} from "@vuarau/domain-contracts";

/**
 * Fixed, readable, valid v4-shaped UUIDs.
 *
 * Nothing here is random. A failing test must fail the same way on every run and
 * on every machine, and a debug session must not require reading a new UUID each
 * time. The last group encodes what the id is, so `…-0000000000a1` is always the
 * same customer.
 */
function uuid(kind: string, n: number): string {
  const suffix = `${kind}${String(n).padStart(2, "0")}`.padStart(12, "0");
  return `00000000-0000-4000-8000-${suffix}`;
}

export const WORKSPACE_ID = uuid("a", 1) as WorkspaceId;
/** A second workspace, used only to prove isolation (BR-CUSTOMER-002). */
export const OTHER_WORKSPACE_ID = uuid("a", 2) as WorkspaceId;

/**
 * What each depot calls itself. Only workspace discovery needs these — it is the
 * one read that returns a workspace's own name rather than something inside it
 * (BR-AUTH-008). Deliberately not in alphabetical order of id, so a test that
 * asserts ordering asserts something.
 */
export const WORKSPACE_NAME = "Vựa rau Thủ Đức";
export const OTHER_WORKSPACE_NAME = "Vựa rau Bình Điền";

/** The default actor in most tests. Holds the `owner` role. */
export const ACTOR_ID = uuid("b", 1) as ActorId;
export const OTHER_ACTOR_ID = uuid("b", 2) as ActorId;

/**
 * One actor per role, so a test can pick the identity that makes its point
 * instead of mutating a shared one (BR-AUTH-004).
 */
export const OWNER_ACTOR_ID = ACTOR_ID;
export const ACCOUNTANT_ACTOR_ID = uuid("b", 3) as ActorId;
export const SALES_ACTOR_ID = uuid("b", 4) as ActorId;
export const WAREHOUSE_ACTOR_ID = uuid("b", 5) as ActorId;
export const DELIVERY_ACTOR_ID = uuid("b", 6) as ActorId;
/** An active actor whose membership has been revoked (BR-AUTH-003). */
export const REVOKED_ACTOR_ID = uuid("b", 7) as ActorId;
/** A member of OTHER_WORKSPACE_ID only — used to prove isolation. */
export const FOREIGN_ACTOR_ID = uuid("b", 8) as ActorId;

/**
 * Verified JWT subjects. In production these are Supabase `auth.users.id`
 * values; here they are fixed so a failing test names the same subject twice.
 */
export const subjectFor = (actorId: ActorId): string => `sub-${actorId}`;

export const CUSTOMER_ID = uuid("c", 1) as CustomerId;
export const CUSTOMER_WITH_DEBT_ID = uuid("c", 2) as CustomerId;
export const CUSTOMER_ZERO_DEBT_ID = uuid("c", 3) as CustomerId;

export const PRODUCT_CA_CHUA_ID = uuid("d", 1) as ProductId;
export const PRODUCT_RAU_MUONG_ID = uuid("d", 2) as ProductId;
export const PRODUCT_OT_ID = uuid("d", 3) as ProductId;

export const SALE_ID = uuid("e", 1) as SaleId;
export const EMPTY_SALE_ID = uuid("e", 2) as SaleId;
export const POSTED_SALE_ID = uuid("e", 3) as SaleId;
export const VOIDED_SALE_ID = uuid("e", 4) as SaleId;
export const DUE_SALE_ID = uuid("e", 5) as SaleId;
export const REPLACEMENT_SALE_ID = uuid("e", 6) as SaleId;
export const SALE_VOID_ID = uuid("e", 7) as SaleVoidId;
export const SECOND_SALE_VOID_ID = uuid("e", 8) as SaleVoidId;

export const SALE_LINE_1_ID = uuid("f", 1) as SaleLineId;
export const SALE_LINE_2_ID = uuid("f", 2) as SaleLineId;
export const SALE_LINE_3_ID = uuid("f", 3) as SaleLineId;

export const PAYMENT_ID = uuid("1", 1) as PaymentId;
export const PARTIALLY_REVERSED_PAYMENT_ID = uuid("1", 2) as PaymentId;
export const FULLY_REVERSED_PAYMENT_ID = uuid("1", 3) as PaymentId;

export const REVERSAL_ID = uuid("2", 1) as PaymentReversalId;
export const SECOND_REVERSAL_ID = uuid("2", 2) as PaymentReversalId;

export const LEDGER_ENTRY_1_ID = uuid("3", 1) as CustomerAccountEntryId;
export const LEDGER_ENTRY_2_ID = uuid("3", 2) as CustomerAccountEntryId;

export const COMMAND_ID = uuid("4", 1) as CommandId;
export const SECOND_COMMAND_ID = uuid("4", 2) as CommandId;
export const THIRD_COMMAND_ID = uuid("4", 3) as CommandId;

export const ADJUSTMENT_ID = uuid("5", 1);

export const IDEMPOTENCY_KEY = "fixture-idempotency-key-0001" as IdempotencyKey;
export const OTHER_IDEMPOTENCY_KEY = "fixture-idempotency-key-0002" as IdempotencyKey;

/** Mints extra ids when a test needs more than the named ones above. */
export function testUuid(kind: string, n: number): string {
  return uuid(kind, n);
}
