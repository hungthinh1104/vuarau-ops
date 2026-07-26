# Traceability

## The chain

```
Use case  →  Business rule  →  Case  →  Test  →  Implementation
UC-*         BR-*              CASE-*   TC-*     file path
```

Every link is declared in [trace-map.yml](trace-map.yml) and verified by
`scripts/trace-check.ts` on every `pnpm verify`.

## ID conventions

| Prefix            | Meaning               | Defined in                                     |
| ----------------- | --------------------- | ---------------------------------------------- |
| `UC-<AREA>-NNN`   | Use case              | `docs/02-use-cases/`                           |
| `BR-<AREA>-NNN`   | Business rule         | `docs/04-business-rules/`                      |
| `CASE-<AREA>-NNN` | Casebook scenario     | `docs/05-casebook/`                            |
| `TC-<AREA>-NNN`   | Automated test        | test file names in `describe(…)`               |
| `ADR-NNNN`        | Architecture decision | `docs/09-decisions/`                           |
| `T-<AGG>-NNN`     | State transition      | `docs/03-state-machines/transition-catalog.md` |
| `ASM-NNN`         | Recorded assumption   | `docs/09-decisions/decision-backlog.md`        |

Areas: `CUSTOMER`, `ORDER`, `PAYMENT`, `DEBT`, `COMMAND`.

**IDs are never reused.** Renaming a rule keeps its ID. Retiring one marks it
deprecated in place; the number is burned.

## Binding tests to rules

A test declares its IDs in the `describe` title:

```ts
describe("BR-PAYMENT-003 / TC-PAYMENT-007", () => {
  it("refuses a reversal larger than the remaining reversible amount", () => { … });
});
```

`trace-check.ts` scans every `*.test.ts` for `TC-*` and `BR-*` tokens and
cross-references them with the trace map. Both directions are checked: a test
naming an unknown rule fails, and a P0 rule named by no test fails.

## What `trace-check.ts` fails on

1. A referenced ID does not exist (unknown `BR-*`, `CASE-*`, `TC-*`, or `UC-*`).
2. A referenced implementation file does not exist on disk.
3. A **P0** business rule has no test reference.
4. A test file names a rule or case that is not in the trace map.
5. A duplicate ID is defined.
6. A use case has no business rule.
7. A business rule has neither a case nor a test.
8. An ID is declared in the map but its documentation file does not contain it.

It is intentionally not a requirements-management platform. It answers one
question — _are these links real?_ — in about 250 lines.

## What it cannot check

It verifies that links resolve, not that documentation is _true_. A rule whose
prose says "half-up" while its code rounds half-even passes the trace check and
fails the human review. That is what
[REVIEW_CHECKLIST.md](../10-ai-coding/REVIEW_CHECKLIST.md) is for.

## Adding a rule — the whole loop

1. Add `BR-X-NNN` to the relevant file in `docs/04-business-rules/` with a risk
   class and the rejection code it produces.
2. Add a case to `docs/05-casebook/` if the rule came from a real scenario.
3. Add `TC-X-NNN` to `trace-map.yml`, listing rules, cases, and implementation
   paths.
4. Write the test with both IDs in its `describe` title.
5. Implement.
6. `pnpm verify`.

Doing 3 before 5 is what makes the failing-test-first workflow verifiable: the
trace check fails until the test exists, and the test fails until the code does.

## Related

- [trace-map.yml](trace-map.yml), [test-strategy.md](test-strategy.md)
- [../09-decisions/ADR-0005-markdown-docs-as-source-of-truth.md](../09-decisions/ADR-0005-markdown-docs-as-source-of-truth.md)
