# Change protocol

Applies to every change, human or AI. A change that skips this is not finished, it
is merely written.

## 1. Before writing code

Answer these. If an answer is unknown, find it — do not assume it.

| Question                                                | Where the answer is                       |
| ------------------------------------------------------- | ----------------------------------------- |
| What is the goal, in the depot's words?                 | The requester, or `docs/00-product/`      |
| Which use case, rule, case, and test IDs does it touch? | `docs/08-qa/trace-map.yml`                |
| What is the risk class?                                 | `docs/08-qa/risk-classification.md`       |
| Does it change a lifecycle value?                       | `docs/03-state-machines/state-catalog.md` |
| Does it move money?                                     | If yes, it is P0 until proven otherwise   |
| Is it in scope for this phase?                          | `docs/00-product/scope.md`                |
| Does it depend on an unresolved policy?                 | `docs/09-decisions/decision-backlog.md`   |

**If the change depends on an unresolved policy, stop and ask.** Do not invent the
answer. Adding a row to the decision backlog and shipping the smallest reversible
default is acceptable; silently choosing is not.

## 2. Declare the change

Every task states:

- **Goal** — one sentence.
- **Related IDs** — `UC-*`, `BR-*`, `CASE-*`, `TC-*`.
- **Files to read** — the context needed to be correct.
- **Files allowed to change** — an explicit list.
- **Files forbidden to change** — migrations already applied, unrelated modules.
- **Expected tests** — which `TC-*` will exist or change.
- **Definition of done** — see below.
- **Risk classification** — P0 / P1 / P2 / P3.

Use [TASK_TEMPLATE.md](TASK_TEMPLATE.md).

## 3. Order of work

The repository authority order is defined only by [docs/README.md](../README.md):
runtime and persistence facts outrank every document. "Documentation-first"
means update the applicable normative document or published contract before the
implementation so the intended change is reviewable; it never means prose can
override the schema, executable rule, or persisted result.

1. Update the **applicable documentation** for the rule, state, or contract first.
   Keep it consistent with the runtime facts and authority order above
   ([ADR-0005](../09-decisions/ADR-0005-markdown-docs-as-source-of-truth.md)).
2. Add the trace-map entry.
3. Write the **failing test**, with its IDs in the `describe` title.
4. **Run it. Confirm it fails for the expected reason** — the missing behaviour, not
   a typo or an unresolved import.
5. Write the minimum code to pass.
6. Run the validation tier appropriate to the current stage.

### During implementation

Run the narrowest failing test first:

- exact test ID with `-t`;
- exact test file;
- affected Vitest project;
- focused database test file when persistence is involved.

Do not run the full repository gate after every edit.

### Before commit

Run:

- the regression test that proves the change;
- the affected test project;
- relevant static checks;
- focused PostgreSQL evidence for persistence, money, inventory or recovery changes.

### Before merge

Run:

```bash
pnpm verify
```

`pnpm verify` is the repository merge gate. It is not the default implementation
feedback loop.

Step 4 is not ceremony. A test that passes before the implementation exists is
testing nothing, and this is the most common way an agent produces work that looks
complete and is not.

## 4. Definition of done

A change is done when **all** of these hold:

- [ ] Focused regression evidence passes.
- [ ] The affected test project passes.
- [ ] Required PostgreSQL evidence passes for persistence-sensitive changes.
- [ ] `pnpm verify` passes before merge.
- [ ] Every new or changed business rule is documented with a stable ID and a risk
      class.
- [ ] Every P0 rule touched has an automated test.
- [ ] A fixed P0/P1 bug has a regression test that fails against the old code.
- [ ] The trace map links use case → rule → case → test → implementation.
- [ ] No architectural boundary was crossed (`pnpm boundary:check`).
- [ ] No unrelated file was changed.
- [ ] Any new assumption is in the decision backlog with an `ASM-*` id.
- [ ] Any new `TODO` names an owner and a backlog reference.

## 5. Forbidden without an explicit decision

| Never                                                                                 | Instead                                                   |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `UPDATE` or `DELETE` on `customer_account_entries`, `payment_reversals`, `audit_logs` | Append a compensating entry                               |
| Hard-delete a posted sale or payment                                                  | There is no such operation                                |
| A generic `update*` / `patch*` / `set*Status` endpoint                                | A named business command                                  |
| Storing a debt balance as authoritative                                               | The ledger is the truth                                   |
| Floating-point money                                                                  | Integer minor units                                       |
| A business rule in the frontend                                                       | Kernel + a capability                                     |
| Duplicating a rule across layers                                                      | One implementation, called from both places               |
| Weakening or deleting a test to make CI green                                         | Fix the code, or change the rule _with_ its documentation |
| A new dependency for a trivial utility                                                | Write the function                                        |
| Implementing an excluded module                                                       | `docs/00-product/scope.md`                                |

## 6. Changing an existing rule

Business rules change — depots change their minds. When one does:

1. Do **not** edit the rule's meaning in place under the same ID if it is now a
   different rule. Mark the old one **deprecated** with the date and its successor,
   and add a new ID.
2. Keep the old test until no production data depends on the old behaviour.
3. Write an ADR if the change has architectural consequences.
4. Record the migration story for existing rows in the ADR. Rows written under the
   old rule do not retroactively become wrong — they were correct when written.

## 7. AI-specific

- Do not "clean up" code you were not asked to change. An unrelated diff hides the
  change that matters.
- Do not add abstractions for one caller.
- Do not create a `utils/` folder.
- If a test fails, identify **which** rule broke before changing anything. Do not
  adjust assertions until the behaviour is understood.
- If the task turns out to be underspecified, say so and propose the smallest
  reversible option. Do not proceed on a guess and report success.

## Related

- [TASK_TEMPLATE.md](TASK_TEMPLATE.md), [REVIEW_CHECKLIST.md](REVIEW_CHECKLIST.md)
- [../08-qa/traceability.md](../08-qa/traceability.md)
