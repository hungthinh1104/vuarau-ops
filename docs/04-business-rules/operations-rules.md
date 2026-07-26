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

## Related

- [../11-operations/deployment-contract.md](../11-operations/deployment-contract.md) — what an environment must satisfy
- [../09-decisions/ADR-0010-supabase-jwt-verification.md](../09-decisions/ADR-0010-supabase-jwt-verification.md) — why JWKS is preferred
- [read-rules.md](read-rules.md), [authorization-rules.md](authorization-rules.md)
