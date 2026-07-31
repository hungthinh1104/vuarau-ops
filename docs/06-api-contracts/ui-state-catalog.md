# UI state catalog

Every state a screen in this system must be able to render, and the server signal
that produces it.

Every state here is a Storybook story in `apps/web`, and that is checked by machine
rather than claimed: `catalog-coverage.test.ts` (TC-WEB-012) parses the coverage
checklist at the end of this document and fails the build when a state named here
has no story, or a story claims a state this document does not name.

The states were derived from what the backend actually returns rather than from
what a designer guessed, which is why the catalog was written before the UI was.

A state is in this catalog because the backend can produce it. If the backend
cannot produce it, it does not belong here; if the backend can produce it and it is
not here, that is a gap, and the gap is where a user ends up staring at a spinner
that never resolves.

**Coverage means a story exists, not that every production screen has complete
screen-level state coverage.** The production workflows now exist. This catalog
still has to evolve with the Goods Flow and Operational Control surfaces; a green
coverage test only proves the states named here have stories, not that this list is
complete. Screen-level Storybook completion is therefore a repository-readiness
concern, not something inferred from this checklist alone.

---

## 0. Signing in and choosing a depot

| State                     | When                                                       | Must show                                                             |
| ------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------- |
| `signed_out`              | No Supabase session                                        | A way in using the provisioned email/password flow; no public sign-up |
| `no_workspace_membership` | Signed in; `session.workspaces` returned an **empty list** | That the account is real and belongs to no depot yet, and who to ask  |

`no_workspace_membership` is the state most likely to be rendered as a spinner
that never resolves, because it looks like "the list has not arrived". It is a
successful answer (BR-AUTH-008): a valid account with no membership — the first
minute of a new person's account, and also what a revoked worker sees. The screen
says so and offers signing out, because nothing else the person does will change
it.

There is deliberately **no** `single_workspace_auto_selected`. Selection is always
explicit: a silently chosen depot is a silently chosen set of books, and the case
where it would be convenient is exactly the case where somebody with two depots
would not notice (BR-CUSTOMER-002).

---

## 1. Loading and empty

| State     | When                                    | Must show                                                                    |
| --------- | --------------------------------------- | ---------------------------------------------------------------------------- |
| `loading` | A request is in flight                  | That work is happening. Never a zero balance while the real one is arriving. |
| `empty`   | The request succeeded and returned none | That there is nothing, and what to do about it                               |

**`empty` is not an error, and it is not `loading` that stopped.** A customer with
no account entries has a balance of exactly 0 ₫, classification `settled`, and an
empty timeline. That is a fact worth stating plainly, not a blank panel.

The failure to avoid: rendering `0 ₫` while `loading`. A worker who reads a
placeholder as a balance collects nothing from somebody who owes money.

---

## 2. Validation and business rejection

Two different states, deliberately not merged.

| State                | Source                                                | Fix belongs to |
| -------------------- | ----------------------------------------------------- | -------------- |
| `validation_error`   | `INVALID_COMMAND_PAYLOAD` — the shape is wrong        | the field      |
| `business_rejection` | Any domain code — the shape is fine, the rule says no | the situation  |

`validation_error` attaches to an input. `SALE_LINE_INVALID` carries `lineIndex`
and `lineId`, so the message belongs on that row and nowhere else.

`business_rejection` attaches to the action. `SALE_EMPTY`, `SALE_ALREADY_VOIDED`,
`PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT` — no field is wrong; the request does
not make sense here. Highlighting a field for these sends the user hunting for a
typo that does not exist.

**Never render `error.message` as the primary text.** Messages will become
Vietnamese and will change; `error.code` is the contract
([error contract](error-contract.md)). Branch on the code, render your own copy,
and keep the message for a diagnostic panel.

---

## 3. Permission denied

| State               | Source                                                  |
| ------------------- | ------------------------------------------------------- |
| `permission_denied` | `PERMISSION_DENIED`, naming the permission and the role |

Distinct from `business_rejection` because the remedy is a person, not a retry:
"ask the owner", not "try again".

Ideally the user never reaches it. `capabilities` on every DTO says in advance
whether the control should be enabled ([capabilities](capabilities.md)), and
`session.me` says whether the menu item should exist at all (UC-AUTH-003). This
state is the honest fallback for when a role changed between the read and the tap —
which is exactly what happens when somebody's access is revoked mid-shift.

The one thing not to do: hide the control **and** show nothing when it is used. A
worker who cannot see why they cannot do their job will find a way around the
system, usually a paper one.

---

## 4. Stale version

| State           | Source                                                                           |
| --------------- | -------------------------------------------------------------------------------- |
| `stale_version` | `SALE_VERSION_CONFLICT`, `PAYMENT_VERSION_CONFLICT`, `CUSTOMER_VERSION_CONFLICT` |

Somebody else changed this while it was on screen. The details carry
`expectedVersion` and `actualVersion`.

**The correct response is reload and show what changed** — not an automatic retry
with the new version. Retrying would apply an intention formed against data this
user never saw: they meant to post a sale of 1.200.000 ₫, and the retry would post
whatever it is now.

This is the state most likely to be implemented as a silent retry by somebody
trying to be helpful. It is a P0 money bug in disguise.

---

## 5. Duplicate-safe retry

| State                  | Source                                                           |
| ---------------------- | ---------------------------------------------------------------- |
| `duplicate_safe_retry` | A replayed command returned the original result (BR-COMMAND-001) |
| `command_in_progress`  | `COMMAND_IN_PROGRESS` — the first attempt is still running       |

The first is a **success**. The user tapped twice, or the client retried after a
timeout, and the server returned what the first attempt produced. Render it as
done. Showing an error here trains people to submit again, which is the one thing
that must not happen around money.

The second is the only retryable code in the catalogue: wait briefly and resubmit
the identical command with the identical key.

`IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD` and `DUPLICATE_COMMAND` are **not**
this state — they are client bugs, and they belong in `business_rejection` with a
diagnostic, because no amount of user retrying will fix either.

---

## 6. Unknown network outcome

| State                     | When                                            |
| ------------------------- | ----------------------------------------------- |
| `unknown_network_outcome` | The request timed out or the connection dropped |

The command may have committed. The client cannot know, and must not guess.

Required behaviour: keep the command with its original `commandId` and
`idempotencyKey`, tell the user it is unconfirmed rather than failed, and resubmit
**the identical command** — which either returns the original result
(`duplicate_safe_retry`) or completes it.

What must never happen: regenerating the key on resubmit. That turns one sale into
two, and no server-side rule can prevent it, because a fresh key is
indistinguishable from a genuinely new command. This is the single most important
line in this catalog.

At a wholesale market at 3 a.m. this is not an edge case; it is Tuesday.

---

## 6b. Customer and membership states

| State                  | Source                                      | Rendering note                                  |
| ---------------------- | ------------------------------------------- | ----------------------------------------------- |
| `customer_active`      | `isActive: true`                            | The ordinary case                               |
| `customer_inactive`    | `isActive: false`                           | Greyed, **still listed**, balance still shown   |
| `membership_revoked`   | `WORKSPACE_MEMBERSHIP_INACTIVE` on any call | Sign the user out and say access was turned off |
| `last_owner_protected` | `WORKSPACE_LAST_OWNER`                      | A `business_rejection`, naming why              |

`customer_inactive` is the one that matters. A deactivated customer who still owes
money must keep appearing with their balance (BR-CUSTOMER-003) — a list that hid
them would let "tidy up the customers" quietly hide debt.

`membership_revoked` can arrive on **any** call, not only at sign-in: membership is
re-read on every request, so a worker whose access is revoked mid-shift finds out
on their next tap. Treat it as a session-ending state everywhere, not as one more
error banner.

## 7. Balance states

Driven by `CustomerAccountBalanceDto.classification` (BR-ACCOUNT-009), never by the
client inspecting the sign.

| State                     | `classification`  | Meaning                     | Rendering note                             |
| ------------------------- | ----------------- | --------------------------- | ------------------------------------------ |
| `balance_receivable`      | `receivable`      | The customer owes the depot | The ordinary case; show the amount and age |
| `balance_settled`         | `settled`         | Exactly zero                | Say "hết nợ", not a blank                  |
| `balance_customer_credit` | `customer_credit` | The depot owes the customer | **Never as a negative debt**               |

The third is the one that matters. A customer who paid ahead has a balance of
`−500.000 ₫`, and a client that renders that as "nợ −500.000" sends a worker to
collect money from somebody the depot owes. It is a credit, and it must be worded
as one.

Overpayment is valid and expected (BR-ACCOUNT-007). The UI does not warn about it,
because there is nothing wrong.

---

## 8. Sale states

| State            | Source                                     | Rendering note                                           |
| ---------------- | ------------------------------------------ | -------------------------------------------------------- |
| `sale_draft`     | `status: draft`                            | Editable, no money moved yet — say so                    |
| `sale_discarded` | `status: discarded`                        | Kept and visible, greyed. **Not** deleted from the list  |
| `sale_posted`    | `status: posted`, `financialState: active` | The receivable stands                                    |
| `sale_voided`    | `financialState: voided`                   | Struck through, **still visible**, with reason and actor |
| `sale_replaced`  | `replacesSaleId` on a newer sale           | Link both ways so a reader can follow the correction     |

A discarded draft stays on the list rather than vanishing. Somebody decided to
throw it away, and that decision is part of the record — the same reasoning that
keeps a voided sale visible. `capabilities.edit` and `capabilities.discard` both
carry `SALE_ALREADY_DISCARDED`, so the controls grey out with a reason.

A voided sale is never hidden. It happened, it was corrected, and both facts are
part of the record (BR-SALE-008). Hiding it produces an account timeline whose
arithmetic cannot be followed: the `+total` and `−total` entries are both there, so
a missing document makes the pair look like a bug.

The void reason and explanation are shown with it. That text is what the person
disputing a balance six months later actually needs (BR-SALE-014).

### Due state

| State         | `dueState`    | Rendering note                                     |
| ------------- | ------------- | -------------------------------------------------- |
| `no_due_date` | `no_due_date` | Show nothing. **Not** a warning, not an amber chip |
| `due`         | `due`         | The date, plainly                                  |
| `overdue`     | `overdue`     | Escalate                                           |

Most depot sales have no due date (BR-SALE-017). Rendering `no_due_date` as a
warning would flag nearly every sale, and a warning that appears on everything is
read as decoration within a week.

---

## 9. Payment and reversal states

| State                        | Source                                      | Rendering note                                            |
| ---------------------------- | ------------------------------------------- | --------------------------------------------------------- |
| `payment_recorded`           | `status: recorded`                          | Nothing reversed                                          |
| `payment_partially_reversed` | `status: partially_reversed`                | Show original, reversed, and **remaining reversible**     |
| `payment_reversed`           | `status: reversed`                          | Terminal; the reverse control is disabled with a reason   |
| `reversal_amount_exceeded`   | `PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT` | A `business_rejection` naming the actual remaining amount |

Partial reversal is supported and normal — a customer overpaid and took some cash
back. The screen must show all three numbers, because "reversed 200.000 of
500.000" and "reversed 200.000" are different facts and only the first is useful.

`remainingReversibleAmount` comes from the server and is not recomputed on the
client (UC-PAYMENT-003): a client that subtracts wrongly offers to reverse money
that is not there.

---

## Coverage checklist

Every one of these is a Storybook story. Nothing here needs a running backend —
each is a fixed DTO plus a fixed rejection.

This list is parsed by TC-WEB-012, so its formatting is load-bearing: one state per
`·`-separated item, lower_snake_case. A state added here without a story fails the
build, which is the only reason the machine-readable copy in
`apps/web/src/ui/catalog-state.ts` exists.

- [x] signed_out · no_workspace_membership
- [x] loading · empty
- [x] validation_error · business_rejection
- [x] permission_denied
- [x] stale_version
- [x] duplicate_safe_retry · command_in_progress
- [x] unknown_network_outcome
- [x] balance_receivable · balance_settled · balance_customer_credit
- [x] sale_draft · sale_discarded · sale_posted · sale_voided · sale_replaced
- [x] customer_active · customer_inactive · membership_revoked · last_owner_protected
- [x] no_due_date · due · overdue
- [x] payment_recorded · payment_partially_reversed · payment_reversed · reversal_amount_exceeded

### Combinations

States that only make sense together, in `Patterns/Combinations`. A component in
isolation can be right and the screen still wrong.

- [x] posted sale with no due date
- [x] voided sale with reason and actor
- [x] replacement sale linked to the original, both directions
- [x] customer credit after overpayment, with the compensating pair in the timeline
- [x] payment partially reversed, showing original, reversed and remaining
- [x] permission revoked between screen load and action
- [x] unknown network outcome followed by duplicate-safe success

## Related

- [capabilities.md](capabilities.md) — what to disable, and why
- [error-contract.md](error-contract.md) — the shape every rejection arrives in
- [../04-business-rules/error-code-catalog.md](../04-business-rules/error-code-catalog.md)
- [../02-use-cases/use-case-catalog.md](../02-use-cases/use-case-catalog.md) — which states each use case can reach
