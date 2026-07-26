# Capabilities

## What they are

A capability is the server's answer to "may this be done, to this thing, right
now?", attached to the DTO the client already has.

```ts
type Capability = {
  allowed: boolean;
  reasonCode?: DomainRejectionCode; // present iff allowed === false
  details?: Record<string, unknown>;
};
```

## The two kinds

| Kind          | Depends on              | Computed by           | Example                 |
| ------------- | ----------------------- | --------------------- | ----------------------- |
| **State**     | the aggregate           | the domain kernel     | may I void _this_ sale  |
| **Authority** | who is asking, and role | the application layer | may I void sales at all |

Both call the same function the command guard calls — `canVoidSale`,
`roleHasPermission` — never a parallel implementation. That is what makes drift
impossible rather than merely unlikely (ADR-0003).

Where a capability needs both, authority is evaluated first, because
`PERMISSION_DENIED` sends the user to a person and a state refusal sends them to a
different action.

## Current shapes

`SaleDto.capabilities`:

```ts
{
  post: Capability;      // draft, ≥1 valid line, caller holds sale.post
  void: Capability;      // posted, not yet voided, caller holds sale.void
  edit: Capability;      // COMMAND_NOT_AVAILABLE — planned (BR-SALE-018)
  discard: Capability;   // COMMAND_NOT_AVAILABLE — planned (BR-SALE-018)
}
```

`PaymentDto.capabilities`:

```ts
{
  reverse: Capability;
}
```

`CustomerAccountBalanceDto.capabilities`:

```ts
{
  adjust: Capability;
}
```

`CustomerDto.capabilities` (planned):

```ts
{
  update: Capability; // COMMAND_NOT_AVAILABLE — UC-CUSTOMER-004
  deactivate: Capability; // COMMAND_NOT_AVAILABLE — UC-CUSTOMER-005
}
```

## What they are for

So the UI disables a button **for the same reason the server would refuse it**,
using the same code and the same wording. Without this, the frontend grows its own
copy of "a sale needs at least one line" — and the two copies drift.

## What they are not

**They are not authorization, and they are not validation.** The command handler
re-evaluates every rule from scratch, from the aggregate it loaded inside the
transaction, ignoring anything the client believed
([ADR-0003](../09-decisions/ADR-0003-backend-owns-business-rules.md)).

A capability is a snapshot from a read that already happened. By the time the user
taps, another worker may have posted the sale. So:

- `allowed: true` means _"the server thought so when it answered your query"_.
- The command may still be refused. The client must handle that
  ([UI state catalog](ui-state-catalog.md)).
- A client that skips a command because `allowed` was false is merely being polite;
  a client that sends it anyway gets the same refusal it would have got.

The dangerous inversion — trusting a capability _instead of_ validating — is
prevented structurally, not by discipline: there is one copy of each rule, and the
capability calls it.

## Current values

| Capability            | `allowed` when                                                   | Otherwise                                                        |
| --------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `sale.post`           | status is `draft` **and** ≥ 1 valid line **and** caller may post | `SALE_ALREADY_POSTED`, `SALE_EMPTY`, or `PERMISSION_DENIED`      |
| `sale.void`           | status is `posted`, no void record, **and** caller may void      | `SALE_NOT_POSTED`, `SALE_ALREADY_VOIDED`, or `PERMISSION_DENIED` |
| `sale.edit`           | never in this phase                                              | `COMMAND_NOT_AVAILABLE` (BR-SALE-018)                            |
| `sale.discard`        | never in this phase                                              | `COMMAND_NOT_AVAILABLE` (BR-SALE-018)                            |
| `payment.reverse`     | `reversedAmount < amount`                                        | `PAYMENT_ALREADY_REVERSED`                                       |
| `account.adjust`      | the caller's role carries `debt.adjust` — owner or accountant    | `PERMISSION_DENIED`, naming the permission and the role          |
| `customer.update`     | never in this phase                                              | `COMMAND_NOT_AVAILABLE` (UC-CUSTOMER-004)                        |
| `customer.deactivate` | never in this phase                                              | `COMMAND_NOT_AVAILABLE` (UC-CUSTOMER-005)                        |

`COMMAND_NOT_AVAILABLE` lets the UI grey out a control it can see in the model
without hard-coding a roadmap. When `EditSaleDraft` ships, the capability starts
returning a real answer and no client changes.

## What a capability must never be used for

Deciding whether a sale is correctable. `sale.void.allowed` says whether the
_void command_ would succeed; whether the sale _should_ be voided is a judgement
for the person, informed by the account timeline. A UI that auto-voids on the
strength of a capability has automated a decision nobody made.

## Related

- [ui-state-catalog.md](ui-state-catalog.md) — how each refusal is rendered
- [error-contract.md](error-contract.md)
- [../04-business-rules/error-code-catalog.md](../04-business-rules/error-code-catalog.md)
- [../04-business-rules/authorization-rules.md](../04-business-rules/authorization-rules.md)
