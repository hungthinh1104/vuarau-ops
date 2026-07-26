# Customer business rules

Customers are master data. They carry no balance of their own — a customer's debt
is a question answered by the ledger ([debt-rules.md](debt-rules.md)).

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

## Deprecated rules

None yet.

## Related

- [../02-use-cases/UC-CUSTOMER-001-create-customer.md](../02-use-cases/UC-CUSTOMER-001-create-customer.md)
- [error-code-catalog.md](error-code-catalog.md)
