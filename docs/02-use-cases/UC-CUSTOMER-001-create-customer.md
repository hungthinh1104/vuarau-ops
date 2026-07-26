# UC-CUSTOMER-001 — Create customer

**Risk:** P1 · **Status:** implemented · **Command:** `CreateCustomer`

## Intent

A worker meets a buyer who is not yet in the system and needs them on file
immediately, so an order can be attached in the next few seconds.

## Actor

Any authenticated member of the workspace. Role-based restriction is not modelled
in this phase (ASM-007).

## Preconditions

- The actor belongs to `workspaceId`.
- The client has generated `customerId` locally.

## Main flow

1. Client generates `customerId` (UUID) and an `idempotencyKey`.
2. Client sends `CreateCustomer` with `displayName`, optional `phone` and `note`.
3. Backend validates the payload schema.
4. Backend checks the idempotency record; a replay returns the original result.
5. Backend creates the customer at `version = 1`, `isActive = true`.
6. Backend writes an audit record (`customer.created`).
7. Backend returns `CustomerDto`.

## Alternate flows

| Situation                           | Outcome                                                          |
| ----------------------------------- | ---------------------------------------------------------------- |
| `displayName` blank or whitespace   | `CUSTOMER_NAME_REQUIRED` (BR-CUSTOMER-001)                       |
| Same key + same payload replayed    | Original `CustomerDto`, no second customer (BR-COMMAND-001)      |
| Same key + different payload        | `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD` (BR-COMMAND-002) |
| Actor not a member of the workspace | `WORKSPACE_ACCESS_DENIED` (BR-CUSTOMER-002)                      |

## Postconditions

- Exactly one `customers` row.
- Exactly one `audit_logs` row.
- **No ledger entry.** Creating a customer never moves money. Their debt is zero
  because they have no ledger entries, not because a zero was stored.

## Business rules

BR-CUSTOMER-001, BR-CUSTOMER-002, BR-COMMAND-001, BR-COMMAND-002, BR-COMMAND-003

## Cases

None specific — covered by the command-level cases in the other use cases.

## Tests

TC-CUSTOMER-001, TC-CUSTOMER-002

## Implementation

- `packages/domain-kernel/src/customer/create-customer.ts`
- `apps/api/src/modules/customer/create-customer.handler.ts`

## Open questions

- Should a duplicate `displayName` within a workspace warn or block? Currently
  neither. See ASM-012.
