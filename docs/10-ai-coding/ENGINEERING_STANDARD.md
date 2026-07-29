# Engineering standard

This is a review standard for changes in this repository. It turns the existing
strict TypeScript, ESLint, boundary check and verification gate into decisions a
reviewer can check. It is deliberately not a list of SOLID/DRY/KISS slogans.

## 1. Dependency direction

`contracts ← domain kernel ← application ← infrastructure / transport / UI`

Imports may point only toward the left. Business decisions do not live in React,
tRPC procedures or Drizzle repositories. A boundary exception needs an ADR and a
test; it must not be hidden behind a utility import.

## 2. One canonical business truth

Each business rule has one canonical implementation. The browser may preview or
render a server result, but it does not independently decide balance,
classification, permission, ordering, currency conversion or state transition.
When a rule is changed, change its canonical implementation and its consumers;
do not copy the rule into another layer.

## 3. Explicit outcomes

`null` means only one thing per read API. A financial or corruption-sensitive
read uses a discriminated result such as `found | not_found | integrity_error`.
Typed domain refusals cross the API boundary as rejection codes. Exceptions are
reserved for unavailable infrastructure or an invariant that cannot safely be
represented as an ordinary result.

## 4. Pragmatic decomposition

A function performs one named operation. Split code when it crosses abstraction
levels or has more than one reason to change. Do not introduce an interface,
factory or helper merely to satisfy a pattern: it needs two real consumers or a
test/substitution boundary. Large React components are split by user-visible
operation, not into pass-through files.

## 5. Persistence and financial reads

The application use case owns the transaction boundary; repositories implement
persistence rather than policy. Financial queries have a real PostgreSQL test.
Pagination ordering is total, deterministic and cursor-compatible. A correctness
comment about SQL/windowing/cursors requires a regression test that would fail if
the query changed to the described incorrect form.

## 6. Change acceptance

Every new behaviour has a contract, implementation, relevant test and
docs/traceability update. A bug fix includes a regression test. A milestone is
not complete from docs, component coverage or a green build alone: its stated
invariants and real-stack paths must be evidenced by the appropriate tests.

## 7. Source boundaries

`pnpm source:check` applies two explicit size policies:

- ordinary hand-written source warns above 450 lines and fails above 700;
- composition entry points fail above 250 lines or when they contain raw SQL.

Composition is an architectural role, not a filename heuristic. The authoritative
list is `scripts/source-boundary-manifest.ts`; adding a new composition entry
requires one obvious repository-relative path there. A generic `index.ts` is not
classified unless it is deliberately declared. Migrations, generated output,
fixtures, tests, and integrated E2E scenarios are excluded. Checker fixtures
protect the thresholds, SQL prohibition, valid composition, and exclusions.

## Reviewer prompts

- Where is the canonical rule, and is any layer recomputing it?
- Does every nullable/error outcome mean exactly one thing?
- If this is money, authorization or pagination, which PostgreSQL and regression
  tests would catch a plausible corruption?
- Does this abstraction have a real second use or a required boundary?
- Does the code, SQL comment, trace entry and test assert the same invariant?
