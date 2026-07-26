# Capabilities

## What they are

A capability is the server's answer to "may this be done, to this aggregate, right
now?", attached to the DTO the client already has.

```ts
type Capability = {
  allowed: boolean;
  reasonCode?: DomainRejectionCode; // present iff allowed === false
  details?: Record<string, unknown>;
};
```

`OrderDto.capabilities`:

```ts
{
  confirm: Capability;
  cancel: Capability;
  adjust: Capability;
}
```

`PaymentDto.capabilities`:

```ts
{
  reverse: Capability;
}
```

## What they are for

So the UI disables a button **for the same reason the server would refuse it**,
using the same code and the same wording. Without this, the frontend grows its own
copy of "an order needs at least one line" — and the two copies drift.

## What they are not

**They are not authorization, and they are not validation.** The command handler
re-evaluates every rule from scratch, from the aggregate it loaded inside the
transaction, ignoring anything the client believed
([ADR-0003](../09-decisions/ADR-0003-backend-owns-business-rules.md)).

A capability is a snapshot from a read that already happened. By the time the user
taps, another worker may have confirmed the order. So:

- `allowed: true` means _"the server thought so when it answered your query"_.
- The command may still be refused. The client must handle that.
- A client that skips a command because `allowed` was false is merely being
  polite; a client that sends it anyway gets the same refusal it would have got.

The dangerous inversion — trusting a capability _instead of_ validating — is
prevented structurally: capabilities are computed by the **same** functions the
domain uses (`canConfirmOrder`, `canReversePayment`), not by a parallel
implementation. There is one copy of each rule.

## Current values

| Capability        | `allowed` when                           | Otherwise                                                      |
| ----------------- | ---------------------------------------- | -------------------------------------------------------------- |
| `order.confirm`   | status is `draft` **and** ≥ 1 valid line | `ORDER_ALREADY_CONFIRMED`, `ORDER_CANCELLED`, or `ORDER_EMPTY` |
| `order.cancel`    | never in this phase                      | `COMMAND_NOT_AVAILABLE` (ASM-005)                              |
| `order.adjust`    | never in this phase                      | `COMMAND_NOT_AVAILABLE` (ASM-010)                              |
| `payment.reverse` | `reversedAmount < amount`                | `PAYMENT_ALREADY_REVERSED`                                     |

`COMMAND_NOT_AVAILABLE` lets the UI grey out a control it can see in the model
without hard-coding a roadmap. When `CancelOrder` ships, the capability starts
returning a real answer and no client changes.

## Related

- [error-contract.md](error-contract.md)
- [../04-business-rules/error-code-catalog.md](../04-business-rules/error-code-catalog.md)
