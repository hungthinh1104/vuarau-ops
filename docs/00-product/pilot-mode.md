# Pilot mode — what this pilot is, and what it is not

**The pilot runs as a `shadow usability pilot`.** One mode is chosen, written down
before the first session, and named in the facilitator's own words to the depot
owner. A pilot whose mode was never stated becomes an operational one by drift:
somebody records a real sale, then another, and three weeks later a depot is
running its books on software nobody agreed to run books on.

---

## The mode, stated

```text
mode: shadow usability pilot
```

| Property                                                       | Holds  |
| -------------------------------------------------------------- | ------ |
| An isolated pilot workspace, used by no other depot            | yes    |
| The depot's **official** account book                          | **no** |
| The worker's own customer names                                | yes    |
| Real transaction shapes — real loads, real prices, real people | yes    |
| Any financial decision resting solely on pilot data            | **no** |
| A facilitator may reset or reconcile the workspace             | yes    |
| Tests usability, comprehension and workflow fit                | yes    |
| Tests bookkeeping, tax, or debt collection                     | **no** |

The last line of the first column is the one that has to be said out loud. Real
names and real numbers go in — anything else invalidates the timing, because
recognising a name is most of the speed — and the depot keeps writing in its
notebook exactly as it does today. **The notebook remains the book.**

## What that buys, and what it costs

**Buys.** The session can be honest about failure. A pilot that is also the real
book cannot be abandoned when something goes wrong, cannot be reset, and quietly
becomes a system nobody chose. A shadow pilot can be stopped on the spot, and the
worst outcome is a wasted morning.

**Buys.** The facilitator may reconcile, correct and reset. A permitted operator
can void a posted sale or create a replacement from Sale detail; the UI runs the
real commands rather than editing rows (BR-OPS-003). `ops:correct-sale` remains a
support tool, not the normal workflow.

**Costs.** Double entry. The worker records each sale twice — their way, then in
the app — and that has to be presented as what it is rather than smuggled in. It
is also, usefully, exactly what the accuracy check needs: their record is the
reference copy of what was sold
([validation-plan.md](validation-plan.md)).

**Costs.** It cannot answer "does a depot trust this enough to stop using paper".
That question needs an operational pilot, and this one does not pretend to reach
it.

## Say this, in these words

To the depot owner, before anything is recorded:

> _"Phần mềm này đang thử nghiệm. Anh/chị cứ ghi sổ như bình thường — sổ giấy vẫn
> là sổ chính. Mình ghi thêm vào máy để xem dùng có tiện không. Nếu máy ghi sai,
> mình sửa hoặc xoá cả vựa thử này cũng được, không ảnh hưởng gì tới sổ của
> anh/chị."_

Two things in that paragraph are load-bearing: the notebook is still the book, and
the pilot workspace can be thrown away. If either turns out not to be true on the
day, the pilot is no longer a shadow pilot and this document no longer describes
it.

## What would make it an operational pilot

An **operational pilot** — where the depot's real receivables live in this system
and a person acts on them — needs all four of these **before it begins**. None is
built today, which is why the mode is not on offer:

| Prerequisite                            | State                                                                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Sale void and replacement UI**        | **Available.** A permitted owner/accountant can void only or void and create a prefilled replacement; retry preserves command identity. |
| **Backup and restore procedure**        | **Missing.** No documented restore, and no one has rehearsed one                                                                        |
| **Real role assignment**                | **Missing.** ASM-017 (the role table is a developer's default) and ASM-018 (everyone was backfilled as `owner`)                         |
| **Incident and reconciliation runbook** | **Missing.** "The balance is wrong and the depot is arguing with a customer" has no written first step                                  |
| **ASM-002 confirmed**                   | **Owed.** The receivable arises at posting ([ADR-0014](../09-decisions/ADR-0014-debt-recognition-at-posting.md)); no owner has said so  |

The first is the sharpest. A depot that cannot undo its own mistake without a
developer is a depot whose books depend on somebody's availability, and the
mistake that needs undoing always arrives on a Sunday.

**Do not silently treat a shadow pilot as production usage.** If a depot starts
relying on what it recorded here, that is a decision to run an operational pilot,
and the table above is what it costs. Notice it and say so; do not let it happen
by not looking.

## Data handling for the session

- **One workspace per depot**, created by
  [pilot-onboarding.md](pilot-onboarding.md). Not the development seed, which
  has demo customers a worker does not recognise.
- **Real customer names go in.** This is the point, and it is what the owner is
  consenting to when they hand over the list.
- **No opening balances are imported.** The import creates customers and nothing
  else (BR-CUSTOMER-005), so every balance in the pilot starts at zero and comes
  from something recorded during the session. A depot's real outstanding debt is
  not copied into a system nobody has agreed to run books on.
- **Workflow metrics carry no business data.** The event vocabulary is closed —
  a metric name and a number, with no field that could hold a name, a note or an
  amount (TC-WEB-023), and nothing is sent anywhere (`apps/web/README.md`).
- **After the pilot**, either the workspace is kept because the depot decided to
  continue — which is the operational decision above, made deliberately — or it is
  deleted. Ask the owner which, and record the answer on the worksheet.

## Related

- [validation-plan.md](validation-plan.md) — the hypotheses, and what settles them
- [pilot-worksheet.md](pilot-worksheet.md) — the sheet used during the session
- [pilot-onboarding.md](pilot-onboarding.md) — setting the workspace up
- [scope.md](scope.md) — what is deliberately not built
- [../11-operations/deployment-contract.md](../11-operations/deployment-contract.md) — the environment the pilot runs in
- [../11-operations/device-smoke-check.md](../11-operations/device-smoke-check.md) — proving the deployment works on a phone
- [../09-decisions/ASM-002-debt-recognition-worksheet.md](../09-decisions/ASM-002-debt-recognition-worksheet.md) — the owner's four questions
- [../09-decisions/decision-backlog.md](../09-decisions/decision-backlog.md) — ASM-017, ASM-018, ASM-023
