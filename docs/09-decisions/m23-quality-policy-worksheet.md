# M23 quality-policy worksheet — ASM-032 / ASM-033 / ASM-034

Use this with the depot owner and the people who actually receive/classify goods.
It records whether the **current software behavior** matches the depot. It does not
ask the software to invent a policy.

If any answer rejects the current behavior, the shadow pilot is blocked for the
affected goods workflow until the domain model is revised and re-verified.

## ASM-032 — Is commercial grade required for every new physical quantity?

Current software behavior:

- every new posted Sale line has one active `QualityGrade`;
- every new Receipt line has one active `QualityGrade`;
- inventory and Delivery preserve `Product + QualityGrade + unit`;
- old pre-grade history remains explicitly unclassified, but new data cannot use
  implicit `null` as "normal".

Ask with real examples:

1. Name three products that are **always** sold/received by grade.
2. Name three products where staff normally say only product + quantity, with no
   grade at all.
3. Is "không phân hạng" a real commercial category workers would say, or would it
   be a fake click added only to satisfy software?
4. Does grade affect price, storage, picking or which goods may fulfil a Sale?
5. Can the same Product be sold simultaneously in more than one grade?

Decision for the current pilot:

- **Accept current behavior** only if requiring an explicit grade for every new
  physical quantity matches the depot closely enough for the shadow pilot.
- **Reject current behavior** if grade must be optional/not-applicable by Product or
  workflow. Do not seed a fake default grade to force a pass.

## ASM-033 — What does Receiving mean when goods are damaged or rejected?

Current software behavior:

- a Receipt means quantity was accepted into inventory;
- Receipt creates positive inventory movement immediately;
- split-grade Receipt is supported;
- Receipt reversal compensates an incorrect Receipt;
- there is no separate `arrived → inspected → accepted/rejected` workflow;
- there is no supplier-quality claim, quarantine, defect/photo evidence or rejected
  quantity model.

Ask:

1. When a truck arrives with 100 kg and 10 kg is damaged, what does the notebook
   record?
2. Is the 10 kg ever counted as depot inventory?
3. Is it returned immediately, kept aside, discounted, or accepted at another
   grade?
4. Does supplier payable change because of rejected/damaged quantity? At what
   moment?
5. Who decides acceptance and who may dispute it later?

Decision for the current pilot:

- **Accept current behavior** only if staff can truthfully record Receipt as
  accepted stock and handle the observed pilot cases without pretending rejected
  goods were accepted.
- **Reject current behavior** if real receiving requires explicit rejected/damaged
  arrival truth. That requires domain work before those flows enter the pilot.

## ASM-034 — Who may manage and reclassify commercial grade?

Current software defaults:

- `quality.manage`: owner, warehouse;
- `inventory.reclassify`: owner, warehouse;
- reclassification requires a reason and appends a conserving movement pair;
- no second approval is required.

Ask:

1. Who creates/renames/deactivates the depot's grade vocabulary?
2. Who decides a real quantity moves from Loại 1 → Loại 2?
3. May sales staff do either operation?
4. Does a large reclassification need owner approval?
5. Is reason text enough evidence, or does the depot require photo/inspection
   evidence?

Accept the current pilot mapping only if those defaults are operationally safe.
Role-policy acceptance here does not replace the broader ASM-017 permission review.

## Evidence record

For each ASM item record:

- reviewer/owner name;
- date;
- accepted or rejected;
- examples discussed;
- notes in their own words;
- stable reference to the signed/scanned worksheet.

The pilot declaration references that evidence. Never commit a filled worksheet
containing real pilot identities or signatures to this repository.
