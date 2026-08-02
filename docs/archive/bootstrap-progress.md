# Bootstrap Progress — vuarau-ops Operational Decision System

Living checklist for the bootstrap task. Update the status boxes as phases complete.
Do not delete history; mark superseded lines as `~~struck~~` with a reason.

---

## Phase A — Repository assessment

Status: **complete** (2026-07-26)

### A.1 What was found

The working directory `/home/diphungthinh/Desktop/VuaNha` was **completely empty**:

- no files, no dotfiles, no `.git` directory;
- not a git repository;
- no `package.json`, no lockfile, no `tsconfig.json`;
- no existing source, migrations, tests, or documentation.

Verified with `ls -la` and `find . -maxdepth 3` (single result: `.`).

**Classification: empty repository.** There is no existing architecture to preserve,
no working code to protect, and no migration risk. Every architectural decision in
this bootstrap is greenfield.

### A.2 Environment probe

| Tool            | Result                              | Consequence                                                                               |
| --------------- | ----------------------------------- | ----------------------------------------------------------------------------------------- |
| Node.js         | v24.11.1                            | Native `node:test` not needed; Vitest fine. ESM + `--experimental-strip-types` available. |
| npm             | 11.7.0                              | Present but not the package manager of record.                                            |
| pnpm            | 11.17.0 (via Corepack)              | pnpm workspaces confirmed viable.                                                         |
| git             | 2.51.0                              | Available; repo was **not** initialised.                                                  |
| psql client     | 17.10                               | Available.                                                                                |
| Postgres server | **not running** on `localhost:5432` | Integration tests need a database provisioned.                                            |
| Docker          | 29.0.4, zero containers             | Used to provision a local Postgres 17 for `test:db`.                                      |
| npm registry    | reachable                           | Dependency install possible.                                                              |

### A.3 Pre-existing conventions discovered outside the repository

A user-level Claude skill `nonsan-agent` exists at
`~/.claude/skills/nonsan-agent/SKILL.md`. It is not part of this repository but it
documents the owner's established engineering conventions for a sibling
"nông sản" system. These conventions were adopted here because they are consistent
with this task's requirements and reduce cross-project friction:

- ledger is the source of truth; debt is never computed directly from transactions;
- `UPDATE`/`DELETE` on financial rows is forbidden — insert an adjustment or void;
- layer boundaries: pure core with no DB / React / tRPC imports;
- no `any`; Zod-validate all external input;
- integer money persisted as Postgres `bigint` with Drizzle `mode: 'number'`;
- Vitest, test-first, corpus/fixture-driven.

Recorded as an assumption in [ASM-014](../09-decisions/decision-backlog.md).

### A.4 Conflicts, missing foundations, risky assumptions

| #   | Item                                                                                                   | Severity                 | Resolution taken                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-1 | No Postgres server reachable                                                                           | Blocking for `test:db`   | Provisioned a local Docker container `vuarau-ops-dev-pg` on port **55432**. `test:db` is skipped (not failed) when `DATABASE_URL` is unset, so CI and laptops without a DB stay green. Documented in `docs/08-qa/test-strategy.md`.       |
| C-2 | Repository is not a git repository, but the task asks for a GitHub CI workflow and a `git diff` review | Medium                   | `git init` performed (no commits made — committing requires explicit user request). CI workflow written but never executed here.                                                                                                          |
| C-3 | VND has no minor currency unit                                                                         | High (money correctness) | Money is stored as an integer number of **đồng** with `exponent: 0`. `Money` carries currency + amount so a future currency with an exponent is representable. See [ADR-0006](../09-decisions/ADR-0006-integer-minor-units-for-money.md). |
| C-4 | Non-integer quantities (1.5 kg, 0.5 thùng) cannot be floats                                            | High                     | Quantities use integer **milli-units** (scale 1000). Line total = `roundHalfUp(qtyScaled × unitPrice / 1000)`. See [BR-SALE-004](../04-business-rules/sale-rules.md).                                                                     |
| C-5 | "Debt arises when?" is undecided business policy                                                       | High                     | Smallest reversible default: debt arises at **order confirmation**. Marked [ASM-002](../09-decisions/decision-backlog.md).                                                                                                                |
| C-6 | "Can debt go negative?" is undecided                                                                   | High                     | Default: **yes**, negative balance = prepaid credit, no guard rail. Explicitly _not_ asserted as an invariant. [ASM-001](../09-decisions/decision-backlog.md).                                                                            |
| C-7 | Ports vs. adapters ownership could invert the dependency arrow                                         | Medium                   | `packages/db` exposes schema + query functions + a transaction runner and knows nothing about application ports. `apps/api` defines the ports and owns the adapters. `db` never imports `api`.                                            |
| C-8 | `apps/web` would pull Next.js + React (large install) for zero value in this task                      | Low                      | Directory created with a README only. No UI framework installed. Recorded in the final report as intentionally not implemented.                                                                                                           |
| C-9 | Turborepo adds a ~100 MB binary for 7 packages                                                         | Low                      | **Not adopted.** `pnpm -r` covers the current task graph. Revisit trigger recorded in [ADR-0001](../09-decisions/ADR-0001-modular-monolith.md).                                                                                           |

### A.5 Reusable code identified

None. The repository was empty.

---

## Implementation plan

Ordered, each step independently verifiable.

1. **Workspace foundation** — `pnpm-workspace.yaml`, root `package.json` with the
   quality-command surface, `packages/config` holding the strict `tsconfig.base.json`,
   shared Vitest config, ESLint flat config, Prettier, `.gitignore`, `.env.example`.
2. **`packages/domain-contracts`** — branded IDs, `Money`, `Quantity`, units, enums,
   the rejection-code catalog, `DomainError`, `Capability`, the command envelope,
   the six command payload schemas, DTO schemas, domain-event schemas. Zero runtime
   dependencies beyond Zod.
3. **Documentation foundation** — every file listed in the task brief under `docs/`,
   plus `docs/08-qa/trace-map.yml` and `docs/09-decisions/decision-backlog.md`.
   Written before the domain code so the rules being implemented are the documented
   ones.
4. **`packages/test-fixtures`** — deterministic fixed-UUID fixtures for the eleven
   required scenarios. No randomness.
5. **Failing tests first** — the ten required P0 tests in `packages/domain-kernel`
   and `apps/api`. Verify each fails for the expected reason (missing module /
   missing behaviour), never a typo.
6. **`packages/domain-kernel`** — pure decision functions:
   `createCustomer`, `createOrder`, `confirmOrder`, `recordPayment`,
   `reversePayment`, `adjustDebt`, plus `debt-summary` folding. Framework-free.
7. **`apps/api` application layer** — one command handler per command implementing
   the eleven-step pipeline (validate → authorize → idempotency → load → version →
   decide → persist in one transaction → ledger → audit → projection → receipt →
   DTO). Ports + in-memory adapters first.
8. **`packages/db`** — Drizzle schema for the fourteen slice tables, generated SQL
   migration, repositories, `withTransaction` runner, seed.
9. **tRPC router + contract tests** — typed caller-based tests, no HTTP needed.
10. **Tooling** — `scripts/trace-check.ts`, `scripts/docs-check.ts`,
    `scripts/boundary-check.ts` (enforces §7 import bans with zero dependencies),
    GitHub Actions workflow, root `CLAUDE.md` + `README.md`.
11. **Verification** — `pnpm verify`, review diff, self-review against the brief.

### Out of scope, deliberately not built

Inventory, receiving, allocation, delivery, invoices, suppliers, pricing engines,
offline sync, LLM parsing, forecasting, scoring, route optimisation, rule builders,
microservices, Kafka, event sourcing, accounting, Kubernetes, production UI,
dashboards, deployment pipelines.

---

## Phase B — Documentation foundation

Status: **complete**

- [x] `docs/00-product/` product brief + scope
- [x] `docs/01-domain/` glossary + context map
- [x] `docs/02-use-cases/` UC-CUSTOMER-001, UC-ORDER-001, UC-PAYMENT-001/002, UC-ACCOUNT-002
- [x] `docs/03-state-machines/` order, payment, state catalog, transition catalog
- [x] `docs/04-business-rules/` order, payment, debt, error-code catalog
- [x] `docs/05-casebook/` order, payment, debt cases
- [x] `docs/06-api-contracts/` command contracts, error contract, capabilities
- [x] `docs/07-data/` data model, time semantics, ledger model
- [x] `docs/08-qa/` test strategy, traceability, risk classification, manual template, trace-map.yml
- [x] `docs/09-decisions/` ADR-0001..0009 + decision backlog
- [x] `docs/10-ai-coding/` REPO_MAP, TASK_TEMPLATE, REVIEW_CHECKLIST, CHANGE_PROTOCOL

## Phase C — Workspace and package foundation

Status: **complete**

- [x] pnpm workspace, strict TS, Vitest projects, ESLint, Prettier
- [x] `packages/domain-contracts`
- [x] `packages/domain-kernel`
- [x] `packages/db`
- [x] `packages/test-fixtures`
- [x] `packages/config`

## Phase D — First failing tests

Status: **complete, with a stated limit.**

The 58 **domain** tests were written before their production code and observed
failing for the expected reason (unresolved import), then implemented. That covers
required tests 1, 6, 8 and 10 and every P0 rule in the kernel.

The 80 **application, contract and database** tests were written _after_ their
handlers, because those handlers share a pipeline that already existed. They were
not run-to-fail first. Recorded plainly rather than claimed otherwise — see
[../08-qa/test-strategy.md](../08-qa/test-strategy.md).

Two of them failed on first run for real reasons (a schema shadowing a domain
rule's stable code, and a genuine `DUPLICATE_COMMAND` refusal), both fixed in the
production code rather than by weakening the test.

## Phase E — Minimum implementation

Status: **complete**

- [x] customer / order / payment / debt domain kernel
- [x] command handlers with idempotency + optimistic concurrency
- [x] append-only ledger effects
- [x] audit records

## Phase F — Persistence and contracts

Status: **complete**

- [x] Drizzle schema + generated migration
- [x] repositories + transaction boundary
- [x] tRPC router + contract tests
- [x] integration tests (auto-skip without `DATABASE_URL`)

## Phase G — Verification

Status: **complete.** `pnpm verify` was run end to end with a live Postgres and
passed:

| Gate         | Command                          | Result                                                                     |
| ------------ | -------------------------------- | -------------------------------------------------------------------------- |
| Format       | `prettier --check .`             | pass                                                                       |
| Lint         | `eslint .`                       | pass (caught a literal NUL byte in a regex in `scripts/boundary-check.ts`) |
| Types        | `tsc --noEmit`                   | pass (caught tRPC v11's `rawInput` → `getRawInput()` rename)               |
| Boundaries   | `node scripts/boundary-check.ts` | pass — 5 boundaries                                                        |
| Docs         | `node scripts/docs-check.ts`     | pass — 46 documents, 120 links, 71 ids                                     |
| Traceability | `node scripts/trace-check.ts`    | pass — 5 use cases, 32 rules (20 P0), 25 cases, 43 tests                   |
| Tests        | `vitest run`                     | **138 passed** across four projects                                        |

Test counts by project: domain 58, application 48, contract 13, db 19.

Without `DATABASE_URL` the db project reports **19 skipped**, not failed, and the
rest of the gate stays green.

`trace-check` was negative-tested: breaking a P0 rule's test reference, pointing at
a non-existent implementation file, and referencing an unknown case each produced
the expected failure and a non-zero exit.

### Corrections made during verification

- `docs/10-ai-coding/REPO_MAP.md` and `docs/01-domain/context-map.md` originally
  stated that `packages/db` may not import `domain-kernel`. The implementation
  does import it, for row-to-domain-state mapping, and that arrow points inwards
  correctly. The documents were corrected to match the code; the real ban
  (`db` must not import `apps/api`, `apps/api` must not import `drizzle-orm`) is
  the one now stated and enforced.
