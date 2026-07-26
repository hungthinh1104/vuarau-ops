# Deployment contract — what a pilot environment must satisfy

**Vendor-neutral on purpose.** This says what has to be true, not who provides it.
A hosting choice made now would be made before anybody has watched a depot use the
product, and it would be copied forward as though it had been decided.

Anything that satisfies every line below is a valid pilot environment.

---

## Topology

```text
phone browser
  ↓  HTTPS
Next application                       serves the UI, rewrites /trpc
  ↓  same-origin /trpc
API process                            verifies the token, runs the command
  ↓
PostgreSQL 17
```

**Same origin, and therefore no CORS.** The browser calls `/trpc` on the origin it
was served from, and the Next server rewrites that to the API
(`NEXT_PUBLIC_API_ORIGIN`, see `apps/web/next.config.ts`). Cross-origin would mean
writing a CORS policy, and a CORS policy written before there is a deployment to
write it for is a guess that gets copied into production. **Do not add a permissive
one to make a split origin work** — put the two behind one hostname instead.

The API needs no public hostname of its own. If the environment can keep it on a
private network reachable only by the Next server, do that; nothing in the product
requires it to be addressable from a phone.

## Environment

Nothing is optional because a default would be convenient. `ops:check-env` refuses
a configuration the API would refuse (BR-OPS-002).

### API process

| Variable                | Required        | Notes                                                          |
| ----------------------- | --------------- | -------------------------------------------------------------- |
| `APP_ENV`               | yes, `pilot`    | Turns on the stricter rules below. Defaults to `development`   |
| `DATABASE_URL`          | yes             | `postgres://…`. Credentials belong to the deployment, not here |
| `SUPABASE_JWT_ISSUER`   | yes             | Must be **https** in a pilot                                   |
| `SUPABASE_JWT_AUDIENCE` | no              | Defaults to `authenticated`                                    |
| `SUPABASE_JWKS_URL`     | yes, in a pilot | The **only** verification method a pilot accepts               |
| `SUPABASE_JWT_SECRET`   | **refused**     | HS256 is a development and end-to-end path only                |
| `PUBLIC_APP_ORIGIN`     | yes, in a pilot | The https origin a phone opens. Must be https                  |
| `PORT`                  | no              | Defaults to 3000                                               |

### Next application

| Variable                        | Required  | Notes                                            |
| ------------------------------- | --------- | ------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | yes       | Public: identifies the project                   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes       | Public: publishable, authorises nothing alone    |
| `NEXT_PUBLIC_API_ORIGIN`        | yes       | Where `/trpc` is rewritten to                    |
| `NEXT_PUBLIC_E2E_AUTH_BRIDGE`   | **never** | Playwright only, and inert in a production build |

**No production secret ever takes a `NEXT_PUBLIC_` name.** Next inlines those at
build time, so such a variable is not merely readable by the browser — it is
compiled into a bundle a phone downloads and a CDN caches. Exactly the two above
belong there, and `ops:check-env` fails a configuration that names any other
secret-shaped one.

The browser therefore receives **only** the Supabase project URL and the
publishable anon key. The JWT signing material, the database credentials and the
service-role key never leave the server side.

## Token verification

JWKS, from the configured Supabase issuer, with the audience checked
([ADR-0010](../09-decisions/ADR-0010-supabase-jwt-verification.md)).

The API then holds no material that can _mint_ a token — only material that can
_check_ one. A compromise of the API process is bad; a compromise that also hands
over a signing secret is a compromise that can impersonate the depot owner in the
audit trail, which is the one record the product exists to keep trustworthy.

`SUPABASE_JWT_SECRET` is refused outright when `APP_ENV=pilot`. It exists for a
laptop and for Playwright, neither of which has a Supabase project to fetch keys
from.

## Start-up order

```bash
pnpm --filter @vuarau/api ops:check-env    # 1. refuse a bad configuration early
pnpm db:migrate                             # 2. explicitly, as its own step
node apps/api/src/server.ts                 # 3. only then
```

**Migrations run as their own step, before the application starts.** Not on boot:
two instances starting together would race, and a migration that fails half-way
during a rolling restart leaves a schema nobody chose. Run it once, look at it,
then start.

**`pnpm db:seed` must never run automatically.** It creates demo customers — "Chị
Lan chợ Bình Điền", "Cô Bảy vựa Hóc Môn" — and a worker who sees a name they do not
recognise in their own depot has been given a reason to distrust every other name
on the screen. `ops:pilot-readiness` fails when it finds one.

**The API refuses to start on an incomplete configuration** (BR-OPS-002), so a
missing variable is a failed deploy naming the variable rather than a request that
fails in front of somebody.

## Health

| Endpoint        | Answers                         | Fails when                                   |
| --------------- | ------------------------------- | -------------------------------------------- |
| `/health/live`  | "is this process still running" | The process is gone. Touches nothing else    |
| `/health/ready` | "may traffic be sent here"      | Configuration incomplete, or Postgres silent |

The distinction matters to whoever is holding the pager. Liveness touches nothing,
so a database outage does not make an orchestrator kill and restart every instance
of a perfectly healthy application. Readiness runs `select 1`, because a process
whose database is unreachable is running fine and cannot record a sale — and
sending a worker to it loses their entry.

Readiness names the failing check (`"database"`) and nothing else. It is
unauthenticated by necessity, which makes it the one place a stack trace would be
published (BR-OPS-001).

Point the load balancer's health check at `/health/ready` and its restart policy at
`/health/live`. Never the other way round.

## Logs

One JSON line per event, on stdout, from a closed vocabulary — identifiers, enums
and numbers (BR-OPS-001). No token, no customer name, no note, no amount.

Correlation: every request gets an `x-request-id` (taken from the caller when
offered, so a trace survives a proxy) and echoes it in the response header. Each
command logs that id alongside its own `commandId`, so one line in a load balancer
log leads to the command, and the command leads to the audit record — which is
where the business detail lives, behind `audit.read`.

Ship stdout wherever the environment ships stdout. Nothing here needs a log agent
configured with a redaction rule, because there is nothing to redact.

## Data ownership, backup and retention

**This must be filled in by whoever operates the pilot. It is not filled in here,
and the blanks are the point.**

```text
Database operator:            ____________________
Backup mechanism:             ____________________
Backup frequency:             ____________________
Backup retention:             ____________________
Restore rehearsed on:         ____________________   ← blank means: not rehearsed
Who may read the database:    ____________________
Deletion after the pilot:     ____________________
```

What can be stated without knowing the vendor:

- **The ledger is append-only and the balance is a cache.** A restore that loses
  the balance projection loses nothing: `ops:rebuild-balance` recomputes it from
  the entries. A restore that loses _entries_ loses the depot's book.
- **Point-in-time recovery is worth more than snapshots here**, because the damage
  this system can suffer is a wrong entry rather than a lost disk, and a wrong
  entry is corrected forward (`VoidSale`, `AdjustCustomerDebt`) rather than by
  rolling back.
- **A restore that has not been rehearsed is a plan, not a capability.** No claim
  is made here that one has been. Until that line has a date in it, the pilot
  cannot be an operational one ([pilot-mode.md](../00-product/pilot-mode.md)).

For a **shadow** pilot the exposure is bounded by design: the depot's notebook
remains its book, so losing the pilot database costs the session's observations and
not the depot's receivables. That is a reason the shadow mode was chosen, not a
reason to skip the table above.

## What this contract deliberately does not specify

- **A hosting vendor, a container runtime, or a CI deployment pipeline.** Choosing
  one before a depot has used the product is choosing it on no evidence.
- **TLS termination, rate limiting, graceful shutdown.** All three belong to the
  environment. They are listed as the environment's job rather than half-built in
  the application.
- **Horizontal scaling.** One depot, one worker, one phone.

## Related

- [device-smoke-check.md](device-smoke-check.md) — proving a deployment works on a real phone
- [../04-business-rules/operations-rules.md](../04-business-rules/operations-rules.md) — BR-OPS-001, BR-OPS-002
- [../00-product/pilot-mode.md](../00-product/pilot-mode.md) — what this environment is for
- [../00-product/pilot-onboarding.md](../00-product/pilot-onboarding.md) — preparing the depot inside it
- [../09-decisions/ADR-0010-supabase-jwt-verification.md](../09-decisions/ADR-0010-supabase-jwt-verification.md)
