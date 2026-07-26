# ADR-0005 — Markdown docs and a trace map as source of truth

**Status:** accepted · 2026-07-26

## Context

This system will be built largely by AI agents working one task at a time, each
starting without memory of the last. An agent that cannot find out _why_ a rule
exists will re-derive it, and re-derivation of money rules produces plausible,
subtly wrong code.

Requirements in a ticket tracker are invisible to the agent editing the file. A
wiki drifts because nothing fails when it does.

## Decision

1. Business rules, use cases, cases, state machines, and decisions live as Markdown
   in `docs/`, versioned with the code, changed in the same commit as the code.
2. Every artefact has a stable ID: `UC-*`, `BR-*`, `CASE-*`, `TC-*`, `ADR-*`,
   `T-*`, `ASM-*`. IDs are never reused; superseded artefacts are marked deprecated,
   not deleted.
3. `docs/08-qa/trace-map.yml` is the machine-readable index linking use case → rule
   → case → test → implementation file.
4. `scripts/trace-check.ts` fails the build on a broken link: an unknown ID, a
   missing file, a P0 rule with no test, a test naming a rule that does not exist,
   a duplicate ID, a use case with no rule, a rule with no case or test.
5. Test names carry their IDs: `describe("BR-PAYMENT-003 / TC-PAYMENT-007", …)`.

## Alternatives considered

| Alternative                          | Why not                                                                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Jira / Linear as the source of truth | Not in the working directory when the code is being changed. Cannot be checked by CI.                                   |
| Docstrings only                      | Good for local "how", useless for cross-cutting "why" — a rule spanning kernel, handler, and schema has no single home. |
| A requirements-management tool       | Heavy, and the trace check needed here is ~200 lines of TypeScript.                                                     |
| Docs without a checker               | This is a wiki. It drifts, silently, and the first person to notice is the one debugging a wrong balance.               |

## Consequences

**Good.** An agent reading `BR-PAYMENT-003` in a test name can find the rule, the
case it came from, and the decision behind it, without asking anyone. Docs cannot
rot past the point the checker notices. `git log` on `docs/04-business-rules/`
is the history of the business's thinking.

**Bad.** Adding a rule means touching several files. The checker is a custom script
that has to be maintained. Prose can still be wrong in ways no script detects —
the check verifies that links resolve, not that claims are true.

**Neutral.** Docs are English with Vietnamese domain terms kept in the original.
Translating "công nợ" to "accounts receivable" would lose the meaning the depot
actually has.

## Revisit when

- The trace map exceeds a few hundred entries and hand-maintenance becomes the
  bottleneck. The fix then is generating parts of it from code annotations, not
  abandoning it.
