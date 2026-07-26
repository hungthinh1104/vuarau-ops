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

## Which DTO carries which

Not every capability carries both halves, and a client that assumes otherwise
shows a button it should not.

| Capability field                      | Carries                    |
| ------------------------------------- | -------------------------- |
| `SaleDto.capabilities.*`              | **state only**             |
| `PaymentDto.capabilities.reverse`     | **state only**             |
| `CustomerDto.capabilities.*`          | authority, plus `isActive` |
| `CustomerAccountBalanceDto.…​.adjust` | authority only             |

The split is deliberate rather than accidental: sale and payment capabilities are
computed in the domain kernel, which by construction does not know who is asking,
while the customer and account ones are computed in the application layer, which
does.

The consequence for a client is one rule, and it holds for every control:

> **A control is enabled when the session permission is held _and_ the aggregate
> capability allows it.** `session.me.permissions` answers the first
> (UC-AUTH-003); the DTO answers the second.

A UI that reads only `SaleDto.capabilities.void.allowed` will offer a void button
to a `sales` worker, who will then be refused. That is a rendering bug, not a
security hole — the command re-checks both — but it is the kind that teaches people
the buttons lie.

## Current shapes

`SaleDto.capabilities`:

```ts
{
  post: Capability;      // draft, and ≥1 valid line
  void: Capability;      // posted, and not yet voided
  edit: Capability;      // still a live draft (BR-SALE-018)
  discard: Capability;   // still a live draft (BR-SALE-018)
}
```

`edit` and `discard` always carry the same answer, because they ask the same
question. They are two fields because they are two buttons.

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

`CustomerDto.capabilities`:

```ts
{
  update: Capability; // caller holds customer.update (UC-CUSTOMER-004)
  deactivate: Capability; // still active, and caller holds customer.deactivate (UC-CUSTOMER-005)
  adjustAccount: Capability; // caller holds debt.adjust
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

| Capability            | `allowed` when                                                | Otherwise                                                        |
| --------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| `sale.post`           | status is `draft` **and** ≥ 1 valid line                      | `SALE_ALREADY_POSTED`, `SALE_ALREADY_DISCARDED`, or `SALE_EMPTY` |
| `sale.void`           | status is `posted` and no void record exists                  | `SALE_NOT_POSTED` or `SALE_ALREADY_VOIDED`                       |
| `sale.edit`           | status is `draft`                                             | `SALE_ALREADY_POSTED` or `SALE_ALREADY_DISCARDED`                |
| `sale.discard`        | status is `draft`                                             | `SALE_ALREADY_POSTED` or `SALE_ALREADY_DISCARDED`                |
| `payment.reverse`     | `reversedAmount < amount`                                     | `PAYMENT_ALREADY_REVERSED`                                       |
| `account.adjust`      | the caller's role carries `debt.adjust` — owner or accountant | `PERMISSION_DENIED`, naming the permission and the role          |
| `customer.update`     | the caller's role carries `customer.update`                   | `PERMISSION_DENIED`                                              |
| `customer.deactivate` | the customer is active **and** the caller may deactivate      | `CUSTOMER_ALREADY_INACTIVE` or `PERMISSION_DENIED`               |

`COMMAND_NOT_AVAILABLE` remains in the code catalogue for a capability that exists
in the model before its command does. Nothing returns it today: every capability
above answers from a real rule. It is kept rather than deleted because the next
command to be specified ahead of its implementation will need it, and a client that
already handles it needs no change when that happens.

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
