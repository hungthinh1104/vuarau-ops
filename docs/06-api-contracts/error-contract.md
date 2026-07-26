# Error contract

## Shape

Every business refusal crossing the API boundary is a `DomainError`:

```ts
{
  code: DomainRejectionCode;              // stable, never renamed
  message: string;                        // human-readable, will be translated
  details?: Record<string, unknown>;      // machine-readable context
  retryable: boolean;                     // derived from the code
}
```

Carried on tRPC errors as `error.data.domainError`. The tRPC `code` is a coarse
transport mapping (`BAD_REQUEST`, `CONFLICT`, `NOT_FOUND`, `FORBIDDEN`); the
domain code is the one clients branch on.

## Rules for clients

1. **Branch on `code`, never on `message`.** Messages are English today and will
   become Vietnamese. They are for humans.
2. **Read `details` for specifics**, not by parsing the message.
   `PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT` carries `remaining` — show it.
3. **Only auto-retry when `retryable` is true.** Today only
   `COMMAND_IN_PROGRESS` qualifies. In particular, a version conflict is _not_
   retryable: the user must see what changed.
4. **Handle unknown codes.** New codes are added over time. Fall back to showing
   `message` rather than crashing.

## Business refusal vs. system failure

|               | Business refusal                          | System failure                          |
| ------------- | ----------------------------------------- | --------------------------------------- |
| Example       | `ORDER_EMPTY`, `PAYMENT_VERSION_CONFLICT` | Postgres unreachable, bug               |
| Shape         | `DomainError` with a code                 | `INTERNAL_SERVER_ERROR`, no domain code |
| Expected?     | Yes — a modelled outcome                  | No                                      |
| Client action | Show the specific message, offer the fix  | Generic "try again", report             |

A refusal is not an exception in the domain: decision functions return
`DomainResult<T>` (`{ ok: true, value }` or `{ ok: false, error }`). Only the
transport edge converts a refusal into a thrown tRPC error. Nothing in the domain
kernel throws, so no rule can be silently swallowed by a `catch`.

## Errors and the transaction

A refusal from steps 1–8 of the pipeline rolls back everything and writes nothing.
There is **no** partially-applied command. Refused commands do not consume the
idempotency key: the client may correct the payload and use the same key.

Refused commands are not audited by default. Auditing every mistyped amount would
bury the actions that matter. `audit_logs.rejection_code` exists for the cases
where a refusal _is_ worth recording — a denied override, an authorization
failure — and is populated deliberately, not automatically.

## Example

```json
{
  "code": "PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT",
  "message": "Cannot reverse 400000 VND: only 300000 VND remains reversible.",
  "details": { "requested": 400000, "remaining": 300000, "currency": "VND" },
  "retryable": false
}
```

## Related

- [../04-business-rules/error-code-catalog.md](../04-business-rules/error-code-catalog.md)
- [capabilities.md](capabilities.md)
