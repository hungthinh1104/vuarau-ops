# Customer business rules

Customers are master data. They carry no balance of their own — a customer's debt
is a question answered by the ledger ([customer-account-rules.md](customer-account-rules.md)).

---

### BR-CUSTOMER-001 — A customer requires a non-blank display name

**Risk:** P1 · **Code:** `CUSTOMER_NAME_REQUIRED` · **Tests:** TC-CUSTOMER-001

Trimmed, 1–200 characters. A depot identifies people by name and location
("chị Lan chợ Bình Điền"); an unnamed customer cannot be found again, and a debt
attached to one is unrecoverable.

Phone number is optional on purpose. Many customers do not give one, and making it
mandatory teaches workers to type `0000000000`.

---

### BR-CUSTOMER-002 — Every read and write is scoped to the actor's workspace

**Risk:** P0 · **Code:** `WORKSPACE_ACCESS_DENIED` · **Tests:** TC-CUSTOMER-002

Every business table carries `workspace_id`. Every repository method takes it as a
required argument — it is not an optional filter that a future query can forget.
A command whose actor is not a member of the target workspace is refused before any
data is read.

Workspace isolation is P0 because a leak means one depot seeing, or worse
modifying, another depot's debt book. See
[ADR-0001](../09-decisions/ADR-0001-modular-monolith.md) for why this is enforced
in the application layer today rather than by Postgres row-level security.

---

### BR-CUSTOMER-003 — Deactivation hides a customer; it never settles their balance

**Risk:** P1 · **Code:** `CUSTOMER_ALREADY_INACTIVE` · **Tests:** TC-CUSTOMER-009

`DeactivateCustomer` sets `is_active = false` and does nothing else. The customer
row stays, every account entry stays, and the balance stays exactly what it was.

A deactivated customer with an outstanding receivable still owes it, still appears
in the account book, and still shows up when somebody chases old balances. Any
other behaviour would make "tidy up the customer list" a way to make debt vanish —
precisely the operation a system built to keep debt records trustworthy must not
offer.

Whether a customer holding a non-zero balance may be deactivated **at all** is a
genuine business question. The default is yes, with the balance preserved and
surfaced, recorded as ASM-019.

---

### BR-CUSTOMER-004 — Customer changes go through named commands with a version

**Risk:** P1 · **Code:** `CUSTOMER_VERSION_CONFLICT` · **Tests:** TC-CUSTOMER-007

`UpdateCustomer` changes display name, phone and note. `DeactivateCustomer`
changes activity. Nothing changes both, and no generic patch exists.

The system has no `updateEntity`, and none is to be added. A generic patch is how
a lifecycle field ends up changed by code that had no business touching it — and
the field that gets changed that way is always the one nobody thought to guard.

Both require `expectedVersion`. Two workers correcting the same phone number
produce one winner and one `CUSTOMER_VERSION_CONFLICT`, which is the right answer:
merging two versions of a phone number silently is worse than asking.

---

### BR-CUSTOMER-005 — A bulk import creates customers by command, or creates none

**Risk:** P1 · **Code:** — · **Tests:** TC-CUSTOMER-010, TC-CUSTOMER-011

A pilot needs the worker's **own** customers loaded before the session — typing
forty names in front of them measures typing. The operator tool that does it
(`pnpm --filter @vuarau/api ops:pilot customers`) is bound by three rules.

**It creates customers through `CreateCustomer`, not through SQL.** Every row gets
the same validation, the same audit record and the same idempotency claim a
customer created in the browser gets. A hand-inserted row would be the one customer
in the system with no command and no actor behind it (BR-ACCOUNT-004), and it would
be discovered months later, by a balance nobody can explain.

**The whole file is judged before anything is written.** One unreadable row refuses
the import and names the line and the column. A file half-imported is worse than
one refused: the facilitator cannot tell where it stopped, and re-running it
without stable ids would create the good rows twice.

**Ids and idempotency keys are derived from the file, not minted.** A re-run after
a crash is therefore a replay (BR-COMMAND-001) rather than a second customer list.
The id has to be derived as well as the key, because a replay requires a matching
payload — a fresh uuid under the same key is a rejection, not a replay.

The tool is a **dry run unless `--commit` is given**, and prints exactly what it
would create. There is deliberately no import screen: it is a job done once per
depot by somebody with shell access, and a second way to create customers is a
second set of validation rules to keep in agreement
([scope](../00-product/scope.md)).

What it does **not** do is import balances. An opening balance is money, it needs
`debt.adjust`, and it is `AdjustCustomerDebt` with `reasonCode: opening_balance`
(BR-ACCOUNT-010) — one deliberate command per customer, not a spreadsheet column.

---

## Deprecated rules

None yet.

## Related

- [../02-use-cases/UC-CUSTOMER-001-create-customer.md](../02-use-cases/UC-CUSTOMER-001-create-customer.md), [../02-use-cases/customer-use-cases.md](../02-use-cases/customer-use-cases.md)
- [error-code-catalog.md](error-code-catalog.md)
