# Decision backlog — unresolved business policy

Every entry here is a question that **needs a depot owner to answer**, not a
developer. Each has a current default chosen to be the smallest reversible thing
that makes the slice coherent, and each default is marked as an assumption in the
code and docs.

Nothing in this list has been silently decided.

| ID      | Question                                                     | Current default                                                                   | Reversibility                     | Priority |
| ------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------- | --------------------------------- | -------- |
| ASM-001 | Can customer debt go negative (prepaid credit)?              | **Yes**, unguarded                                                                | Easy — one guard + one code       | **High** |
| ASM-002 | Does debt arise at confirmation, delivery, or invoicing?     | **Confirmation**                                                                  | Hard once data exists             | **High** |
| ASM-003 | Can a payment exceed current debt?                           | **Yes** (follows ASM-001)                                                         | Easy                              | High     |
| ASM-004 | Can a payment stay unallocated to an order?                  | **Yes** — allocation is not modelled at all                                       | Easy — additive read-side feature | Medium   |
| ASM-005 | Can a confirmed order be cancelled once a payment exists?    | **No cancel command exists**                                                      | Easy — nothing to undo            | High     |
| ASM-006 | Are partial payment reversals allowed?                       | **Yes**                                                                           | Medium                            | Medium   |
| ASM-007 | What permission is required to adjust debt?                  | **DECIDED** — `debt.adjust`, held by owner and accountant (Milestone 1, ADR-0011) | n/a                               | closed   |
| ASM-008 | How do product price changes affect confirmed orders?        | **Never** — lines snapshot name and price                                         | Hard to change retroactively      | Medium   |
| ASM-009 | Is workspace isolation enforced by RLS or the application?   | **Application layer**                                                             | Medium — RLS is additive          | Medium   |
| ASM-010 | How is a confirmed order corrected?                          | **`AdjustCustomerDebt` with a reason**                                            | Medium                            | High     |
| ASM-011 | Are units convertible (lạng → gram)?                         | **No conversion at all**                                                          | Easy — additive                   | Low      |
| ASM-012 | Should duplicate customer names be blocked?                  | **Allowed, no warning**                                                           | Easy                              | Low      |
| ASM-013 | Does the API need a compiled `dist/` build?                  | **No** — Node 24 runs TypeScript directly                                         | Easy                              | Low      |
| ASM-014 | How long are `command_receipts` retained?                    | **Forever** — no pruning                                                          | Easy                              | Medium   |
| ASM-015 | Does a customer have a credit limit / debt policy?           | **No such concept**                                                               | Medium — additive                 | **High** |
| ASM-016 | What makes a debt "overdue"? Payment terms?                  | **Not modelled** — no due date, no terms                                          | Medium — additive                 | **High** |
| ASM-017 | Is the role→permission mapping correct beyond `debt.adjust`? | **Least-privilege defaults**, unconfirmed                                         | Easy — one table                  | **High** |
| ASM-018 | Existing memberships were backfilled as `owner`              | **Deliberate**; roles need assigning                                              | Easy                              | **High** |

---

## The ones that will hurt if left

### ASM-001 / ASM-003 — negative balances

**Default:** a payment larger than the balance is accepted and the balance goes
negative, meaning the depot owes the customer credit.

**Why this default:** the brief explicitly forbids assuming debt can never be
negative. Refusing overpayment would reject a genuine business event — a customer
paying ahead for tomorrow's load — and that rejection would be _invisible_ in the
data, since no record of the attempt would exist.

**What changes if the answer is no:** one guard in `recordPayment`, one new
rejection code, and BR-DEBT-007 gets deprecated. No migration.

**Recorded as:** BR-DEBT-007, CASE-PAYMENT-003, TC-DEBT-007.

---

### ASM-002 — when debt arises

**Default:** at order confirmation.

**Why this default:** confirmation is the only event the slice actually models. It
is also what a depot means by "chốt đơn".

**Why this one is dangerous:** it is the least reversible assumption here. If debt
should really arise at delivery, then every `order_confirmation` entry in
production was written at the wrong time, and fixing it means back-filling
`transaction_time` on immutable rows — which the design forbids. The escape hatch
is that `LedgerSourceType` is an enum: a `delivery_note` source can be added and
confirmation entries stopped, but historical entries stay wrong.

**Ask before real data accumulates.**

---

### ASM-005 — cancelling a confirmed order

**Default:** impossible. There is no `CancelOrder` command; the `cancel` capability
returns `COMMAND_NOT_AVAILABLE`.

**Why this default:** the interesting question is not "can it be cancelled" but
"what happens to a payment already recorded against that debt", and that is a
policy question. Shipping a cancel command with an invented answer would bake the
guess into data.

**Documented but unimplemented:** T-ORDER-003 and T-ORDER-004 in the
[transition catalog](../03-state-machines/transition-catalog.md).

---

### ASM-007 — who may adjust debt · **CLOSED (Milestone 1)**

**Decided:** `AdjustCustomerDebt` requires the `debt.adjust` permission, held by
`owner` and `accountant` only (BR-AUTH-006, [ADR-0011](ADR-0011-role-permission-mapping.md)).
`actorId` is no longer self-asserted: it must match a verified Supabase token
([ADR-0010](ADR-0010-supabase-jwt-verification.md)).

**Was:** any workspace member, with a self-asserted actor id.

**Why this is the most uncomfortable default in the list:** `AdjustCustomerDebt`
can move any balance by any amount with only a free-text reason. In a real depot,
that is an owner-only action. The current model has no roles at all, so there is
nothing to check against.

**Mitigation until then:** every adjustment is attributable — actor, command,
timestamp, reason code, and reason text, all on the ledger entry itself. The action
is not prevented, but it is never anonymous.

The UI design reference (`design.md`) independently assumed this: it lists a
`permission_denied` state on order entry, payment recording, and debt adjustment,
and defines separate patterns for owner, sales, warehouse, delivery, and
accountant roles. The backend now has all five roles.

**What replaces it as highest priority: ASM-017 and ASM-018 below.** The mechanism
exists; the policy it enforces is still a developer's guess.

---

### ASM-015 / ASM-016 — credit limits and overdue debt

**Surfaced by `design.md`, not by this backend.** The UI design reference at the
repository root specifies an `over_credit_limit` state on order entry, a "debt
policy warning", and an "overdue amount" plus "risk status" on the customer debt
screen.

**None of those exist in the backend.** There is no credit limit, no payment
terms, and no due date. The ledger records `transactionTime`, so _aging_ is
computable — "how old is this debt" — but "overdue" needs a policy stating when
payment was due, and that policy has not been decided.

**Do not invent it.** A credit limit set at the wrong threshold refuses real
sales; an overdue rule with the wrong terms puts customers on a chase list who are
not late. Both need the depot owner.

**What is already in place:** every ledger entry carries business time, so any
terms model can be applied retrospectively without a migration.

---

### ASM-017 / ASM-018 — the role table is a guess, and everyone is currently an owner

**ASM-017.** Only `debt.adjust` was specified by Milestone 1. Every other
role→permission pairing is a least-privilege default a developer chose. The two
that most need a depot owner's answer:

- may a **delivery driver record the cash they collect**? Defaulted to _no_, which
  is safe and quite possibly wrong for how these depots actually work;
- may **sales confirm orders**? Defaulted to _yes_, because that is the job — but
  confirmation is the moment debt is created, so it deserves a decision rather
  than an inference.

**ASM-018.** Migration `0002` backfills `workspace_memberships.role` as `owner`.
That was the only choice that could not lock an existing depot out of its own
data — but it means that immediately after migrating, **every existing member
holds `debt.adjust`**. The mechanism is in place and the policy is not yet
applied.

Closing ASM-018 is an operational task, not a code change: assign real roles, then
verify no unintended owners remain.

---

### ASM-010 — correcting a confirmed order

**Default:** a compensating `AdjustCustomerDebt`.

**Consequence, stated plainly:** the order document still shows the wrong total.
Only the ledger explains the difference. That is honest but coarse, and a depot
owner reading the order will find it confusing. A proper `AmendOrder` that
supersedes a confirmed order with a new version is needed.

**Recorded as:** CASE-ORDER-007.

---

## How to close an item

1. Get the answer from the depot owner.
2. Write an ADR if the decision has architectural consequences.
3. Update the rule, the case, and the test.
4. Change the row here to **decided**, linking the ADR. Do not delete the row —
   the history of what was once uncertain is useful.
