# Customer use cases — search, view, update, deactivate

Creating a customer has its own document,
[UC-CUSTOMER-001](UC-CUSTOMER-001-create-customer.md). This file covers the rest.

All four are **planned**: specified and agreed, not yet built. Their capabilities
return `COMMAND_NOT_AVAILABLE` so a UI can be written against them today.

---

## UC-CUSTOMER-002 — Search and list customers

**Risk:** P2 · **Status:** **planned** · **Read:** `customer.list`

| Field          | Value                                                 |
| -------------- | ----------------------------------------------------- |
| **Actor**      | Any active member of the workspace                    |
| **Trigger**    | Starting a sale, or looking up who owes what          |
| **Permission** | `customer.read` — held by every role                  |
| **Result DTO** | A page of `CustomerSummaryDto` with balance and class |

### Preconditions and inputs

```
{ workspaceId, query?, isActive?, hasBalance?, cursor?, limit? }
```

`query` matches display name and phone. Vietnamese names must match with and
without diacritics — a worker searching "co hoa" has to find "Cô Hoà" while
standing at a loading bay on a phone keyboard. Unaccented matching is a
requirement, not a nicety.

### Happy path

Authorize `customer.read`, run the workspace-scoped query, return a cursor page.
Each row carries the account balance and its classification (BR-ACCOUNT-009), so
the list that a worker uses to choose a customer already shows what that customer
owes.

### Alternative and rejection paths

| Situation              | Outcome                         |
| ---------------------- | ------------------------------- |
| No credential          | `AUTHENTICATION_REQUIRED`       |
| Membership revoked     | `WORKSPACE_MEMBERSHIP_INACTIVE` |
| No matches             | Empty page, not an error        |
| `limit` beyond the max | Clamped, not refused            |

### State transition · Account effect · Audit effect

None, none, none.

### Idempotency · Concurrency

Not applicable.

### Offline policy

The customer list is the one read worth caching aggressively: it changes rarely and
is needed constantly, including with no signal. Balances in a cached list must be
displayed with their fetch time — a stale balance presented as current is how a
worker collects the wrong amount.

### Capabilities · UI states

Each row carries `update`, `deactivate`, and `adjustAccount`.
`loading`, `empty`, `permission_denied`, `unknown_network_outcome`,
`balance_receivable`, `balance_settled`, `balance_customer_credit`.

### Rules · Planned tests

BR-AUTH-001, BR-AUTH-004, BR-CUSTOMER-002, BR-ACCOUNT-009 ·
TC-CUSTOMER-004, TC-CUSTOMER-005

---

## UC-CUSTOMER-003 — View a customer

**Risk:** P2 · **Status:** **planned** · **Read:** `customer.get`

| Field          | Value                                                    |
| -------------- | -------------------------------------------------------- |
| **Actor**      | Any active member                                        |
| **Trigger**    | Tapping a customer to see who they are and what they owe |
| **Permission** | `customer.read`                                          |
| **Result DTO** | `CustomerDto` + `CustomerAccountBalanceDto`              |

The account **timeline** is a separate read (UC-ACCOUNT-001), because it is paged
and this is not.

### Alternative and rejection paths

| Situation                     | Outcome                                        |
| ----------------------------- | ---------------------------------------------- |
| Customer in another workspace | `CUSTOMER_NOT_FOUND` — never "wrong workspace" |
| Customer deactivated          | Returned normally, with `isActive: false`      |

A deactivated customer is still readable. Their history did not stop existing, and
somebody chasing an old balance needs to see it.

### State transition · Account effect · Audit effect · Idempotency · Concurrency

None.

### Offline policy · Capabilities · UI states

Cacheable with its fetch time. Carries `update`, `deactivate`, `adjustAccount`.
`loading`, `permission_denied`, `unknown_network_outcome`, the three balance
states.

### Rules · Planned tests

BR-AUTH-001, BR-CUSTOMER-002, BR-ACCOUNT-001, BR-ACCOUNT-009 · TC-CUSTOMER-006

---

## UC-CUSTOMER-004 — Update a customer

**Risk:** P1 · **Status:** **planned** · **Command:** `UpdateCustomer`

| Field          | Value                                         |
| -------------- | --------------------------------------------- |
| **Actor**      | Depot owner or sales worker                   |
| **Trigger**    | A phone number changed; a name was misspelled |
| **Permission** | `customer.update` — held by `owner`, `sales`  |
| **Result DTO** | `CustomerDto` at `version + 1`                |

### Inputs

```
payload: { customerId, displayName, phone?, note? }   + expectedVersion
```

A **named** command, not a generic patch. There is no `updateEntity` in this system
and none is to be added: a generic patch is how a lifecycle field gets changed by
something that had no business changing it.

Note what is absent: no `isActive` (that is UC-CUSTOMER-005), no balance, no
workspace. The set of fields a command may touch is the set it names.

### Happy path

Authorize, load `FOR UPDATE`, check version, validate the name is non-blank
(BR-CUSTOMER-001), write at `version + 1`, audit `customer.updated`.

### Alternative and rejection paths

| Situation               | Outcome                     |
| ----------------------- | --------------------------- |
| Customer not found      | `CUSTOMER_NOT_FOUND`        |
| Blank display name      | `CUSTOMER_NAME_REQUIRED`    |
| Stale `expectedVersion` | `CUSTOMER_VERSION_CONFLICT` |
| Caller is `warehouse`   | `PERMISSION_DENIED`         |

### State transition · Account effect · Audit effect

T-CUST-002. **No account effect** — renaming somebody must never move what they
owe. One audit record with the before/after of the changed fields only.

### Idempotency · Concurrency · Offline policy

Standard; `expectedVersion` required. Offline is supported but conflict-prone: two
workers correcting the same phone number produce one winner and one
`CUSTOMER_VERSION_CONFLICT`, which is correct — merging two versions of a phone
number silently is worse than asking.

### Capabilities · UI states

`update` returns `COMMAND_NOT_AVAILABLE` until implemented.
`loading`, `validation_error`, `permission_denied`, `stale_version`,
`duplicate_safe_retry`, `unknown_network_outcome`.

### Rules · Planned tests

BR-CUSTOMER-001, BR-CUSTOMER-002, BR-AUTH-004, BR-COMMAND-001, BR-COMMAND-005 ·
TC-CUSTOMER-007, TC-CUSTOMER-008

---

## UC-CUSTOMER-005 — Deactivate a customer

**Risk:** P1 · **Status:** **planned** · **Command:** `DeactivateCustomer`

| Field          | Value                                               |
| -------------- | --------------------------------------------------- |
| **Actor**      | Depot owner                                         |
| **Trigger**    | A customer has stopped buying, or was entered twice |
| **Permission** | `customer.deactivate` — held by `owner` only        |
| **Result DTO** | `CustomerDto` with `isActive: false`                |

### The rule that matters

Deactivation **hides a customer from new sales; it does not delete them, and it
does not settle their balance.**

A deactivated customer with an outstanding receivable still owes it. The record
stays, the entries stay, the balance stays, and it still appears in the account
book. Anything else would make "clean up the list" a way to make debt disappear —
which is precisely the operation a system like this must not offer.

Whether a customer with a non-zero balance may be deactivated at all is a genuine
business question. The default is **yes, with the balance preserved and surfaced**,
recorded as ASM-019.

### Inputs, paths, effects

```
payload: { customerId, reason? }   + expectedVersion
```

| Situation               | Outcome                               |
| ----------------------- | ------------------------------------- |
| Customer not found      | `CUSTOMER_NOT_FOUND`                  |
| Already inactive        | `CUSTOMER_ALREADY_INACTIVE`           |
| Stale `expectedVersion` | `CUSTOMER_VERSION_CONFLICT`           |
| Caller is `sales`       | `PERMISSION_DENIED`                   |
| Outstanding balance     | Accepted; balance preserved (ASM-019) |

T-CUST-003. **No account effect.** One audit record, `customer.deactivated`,
carrying the reason.

### Idempotency · Concurrency · Offline policy · Capabilities · UI states

Standard; `expectedVersion` required. Offline supported but rare — this is a
back-office action taken at a desk. `deactivate` returns `COMMAND_NOT_AVAILABLE`
until implemented. States: `loading`, `business_rejection`, `permission_denied`,
`stale_version`, `unknown_network_outcome`.

### Rules · Planned tests

BR-CUSTOMER-002, BR-CUSTOMER-003, BR-AUTH-004, BR-ACCOUNT-002 ·
TC-CUSTOMER-009, TC-CUSTOMER-010

## Related

- [UC-CUSTOMER-001-create-customer.md](UC-CUSTOMER-001-create-customer.md)
- [../04-business-rules/customer-rules.md](../04-business-rules/customer-rules.md)
- [use-case-catalog.md](use-case-catalog.md)
