# Operations business rules

Two rules about the running system rather than about a sale. They are here, with
IDs and tests, because both fail the same way every business rule fails — quietly,
in production, in a place nobody looks — and because "obviously we would not log a
customer's name" is exactly the kind of obviousness that stops being true on a
Friday afternoon.

---

### BR-OPS-001 — Server logs carry correlation identifiers and no business data

**Risk:** P0 · **Code:** — · **Tests:** TC-OPS-003, TC-OPS-004

Every log line is one of a **closed set of events** whose fields are identifiers,
enums or numbers:

```text
startup   appEnv · port · verification
request   requestId · procedure · status · durationMs
command   requestId · commandId · commandType · workspaceId · actorId
          outcome · code · durationMs
query     requestId · queryType · workspaceId · actorId · outcome · code · durationMs
integrity requestId · workspaceId · checkType · status
health    probe · status · failing
```

There is no `message`, no `detail`, and no `Record<string, unknown>` — the shapes
through which a customer's name reaches a log line one "just this once" at a time.
`code` is a rejection code from the closed set, never the human message that
accompanies it, because a message is prose and prose is where somebody eventually
interpolates a name.

**Never logged:** a bearer token, a customer name, a phone number, a note, a
product name, or any amount. A line saying a payment of 4.500.000 ₫ was recorded
is a line saying what a customer owes.

**What replaces them:** `commandId`. It finds the audit record, which holds the
business detail and is access-controlled (`audit.read`, owner and accountant only).
The log says _that_ something happened and _who_ did it; the audit trail says
_what_.

Two failure modes make this P0 rather than a preference. A log file has a different
access list from the database — often a wider one, and usually an unversioned one.
And nobody reads logs; they grep them, so a leak is found by whoever else was
grepping.

TC-OPS-004 runs **real commands** carrying a real name, a real phone number and a
real amount, then asserts none appears in what was written. Asserting on the type
would prove the type; this proves the pipeline.

The unauthenticated readiness endpoint is held to the same rule: it names the
failing check (`"database"`) and never the driver's error text, which is the one
place a stack trace would be published.

---

### BR-OPS-002 — The server refuses to start on a configuration it cannot trust

**Risk:** P1 · **Codes:** — (exit 1) · **Tests:** TC-OPS-001, TC-OPS-002

Configuration is read and judged **before anything listens**. A missing variable
is a startup failure naming the variable; it is not a request that fails later, at
a loading bay, in front of somebody holding a phone.

Every problem is reported at once. A deploy loop that fixes one variable per
attempt takes an afternoon.

**Two environments, and the difference is not decoration.**

| Rule                            | `development` | `pilot`             |
| ------------------------------- | ------------- | ------------------- |
| `SUPABASE_JWT_SECRET` (HS256)   | allowed       | **refused**         |
| `SUPABASE_JWT_ISSUER` scheme    | any           | **https**           |
| `PUBLIC_APP_ORIGIN`             | optional      | **required, https** |
| Exactly one verification method | required      | required            |

`development` is a laptop and the end-to-end suite, which have no Supabase project
to fetch keys from and nothing to protect. `pilot` is a real depot's data on a real
phone, where the same shortcut is a signing key in an environment variable —
anything that can read it can mint a token for any actor, and the audit trail would
name whoever it was told to.

HTTPS is required for the same reason a depot phone is: a one-time code typed on
mobile data over plain HTTP is a session anybody on the path can take.

**A secret must never be given a `NEXT_PUBLIC_` name.** Next inlines those at build
time, so the variable is not merely readable by the browser — it is compiled into a
bundle a phone downloads and a CDN caches. Exactly two belong there:
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, both publishable by
design. Any other `NEXT_PUBLIC_*` whose name reads like a credential fails the
whole configuration rather than warning, because a warning in a deploy log is a
warning nobody read.

**Nothing that was read is ever printed.** Problems name the variable; the summary
reports set/not-set and derived facts — the database host with credentials
stripped, the issuer, which verification method. `ops:check-env` output ends up in
a build log, a support message and a screenshot, and a checker that echoed its
input would put a password in all three (TC-OPS-003).

---

### BR-OPS-003 — A posted sale is corrected by commands, or not at all

**Risk:** P0 · **Codes:** `SALE_ALREADY_VOIDED`, `SALE_NOT_POSTED`, `PERMISSION_DENIED` · **Tests:** TC-OPS-005

A permitted owner/accountant corrects a posted Sale from its detail screen: void
only, or void then create and post a distinct replacement. The UI runs the same
`VoidSale` → optional `CreateSaleDraft` → `PostSale` commands
([ADR-0012](../09-decisions/ADR-0012-sale-void-and-replacement.md)).

**Not a shortcut around the rules.** Same permission (`sale.void`, so an operator
whose role lacks it is refused exactly as a `sales` worker would be), same
idempotency claim, same audit records, same compensating entry. **No ledger row is
written and no row is updated** — the original sale still says what it always said,
and the void is a record beside it (BR-SALE-008).

`AdjustCustomerDebt` is deliberately not the path. It would leave the wrong sale
document standing while quietly patching the balance, so the document and the
balance would tell different stories (BR-ACCOUNT-010).

**Dry run unless `--commit`.** A void is an appended record that cannot be
un-appended, so the tool prints the sale, the balance now, and the balance the
correction would produce, and writes nothing. The projection is arithmetic on
values the server returned — the void compensates the **stored** posted total
(BR-SALE-012) and the replacement is summed with the same `calculateLineTotal` the
server posts with (BR-SALE-004) — and after a commit the tool re-reads the balance
and shouts if the two disagree, because something else moved it.

**The version is stated by the operator and checked.** `VoidSale` carries no
`expectedVersion` by design: a posted sale's version never moves again, so there is
no lost update to guard. What is guarded here is different — that the sale somebody
**looked at** is the sale they are voiding. Between reading a total off a screen and
typing a command, another person may have voided it already.

**Ids are derived from a correction key, so a re-run is a resumption.** A crash
between the void and the replacement leaves a real state — the customer owes
nothing for that load until the replacement is posted — and re-running finishes the
job rather than voiding twice. A void that exists but belongs to a _different_
correction is refused: two corrections of one sale credit the customer twice for
one mistake (BR-SALE-013).

Nothing is rolled back on a partial failure, because there is nothing to roll back
to. Unwinding a void would mean voiding a void.

---

### BR-OPS-004 — Logical recovery is checksummed, empty-target and atomic

**Risk:** P0 · **Codes:** `BACKUP_DIGEST_INVALID`, `BACKUP_UNSAFE_TARGET`,
`BACKUP_INTEGRITY_ERROR` · **Tests:** TC-OPS-006

Only an owner may export, validate or restore a workspace backup. The SHA-256
digest covers a canonical ordering of the payload. Restore rejects a non-empty
business target and broken workspace/customer/product/source references before
success. All canonical inserts and the command receipt share one application
transaction; any thrown persistence failure rolls the transaction back.

Balance projections are excluded from backup authority. Restore rebuilds them
from `customer_account_entries` and then runs the workspace integrity read. A
non-healthy result is a failure, not a warning. Retrying the same restore command
returns its original receipt and does not insert another copy.

This is application-level logical recovery. Physical database restore and PITR
remain deployment infrastructure.

---

### BR-OPS-005 — Public/export inputs fail closed

**Risk:** P0 · **Tests:** TC-OPS-007, TC-OPS-008

The API refuses declared or streamed request bodies above the configured limit and
rate-limits authenticated and public-document surfaces independently. Correlation
ids have a bounded printable shape. CSV fields that spreadsheet applications could
execute as formulae are emitted as literal cells. Public document reads remain
no-store, digest-verified and free of driver/stack detail.

### BR-OPS-006 — Operational signals carry enough correlation and no business payload

**Risk:** P0 · **Tests:** TC-OPS-009

Requests, commands, reads, replays, rejections, integrity and health emit a closed
structured vocabulary. Metrics aggregate bounded operation/result labels and
latency; they never label by workspace, actor, request, command, token, amount,
note, source body or share secret. A request id leads to command receipt, audit and
canonical source without copying the source into telemetry.

### BR-OPS-007 — Scale claims require a measured plan and cursor evidence

**Risk:** P1 · **Tests:** TC-OPS-010, TC-OPS-011

Production-scale query budgets are fixed before optimization. `EXPLAIN (ANALYZE,
BUFFERS)` must show no unexplained sequential scan of the million-row canonical
tables for page reads. Date/cursor filters and `LIMIT` execute in PostgreSQL before
mapping. Same-time rows use the canonical total order and never disappear or
repeat across pages. A cache may not be added without measured evidence.

## Related

- [../11-operations/deployment-contract.md](../11-operations/deployment-contract.md) — what an environment must satisfy
- [../11-operations/threat-model.md](../11-operations/threat-model.md)
- [../11-operations/m22-performance-evidence.md](../11-operations/m22-performance-evidence.md)
- [../11-operations/observability-and-incidents.md](../11-operations/observability-and-incidents.md)
- [../11-operations/recovery-rehearsal.md](../11-operations/recovery-rehearsal.md)
- [../09-decisions/ADR-0010-supabase-jwt-verification.md](../09-decisions/ADR-0010-supabase-jwt-verification.md) — why JWKS is preferred
- [read-rules.md](read-rules.md), [authorization-rules.md](authorization-rules.md)
