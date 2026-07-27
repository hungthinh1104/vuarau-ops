# Setting up a depot for a pilot session

Everything here is done from a shell, before the session, by the facilitator.
Nothing here has a screen, and nothing here should
([scope.md](scope.md)).

Read [pilot-mode.md](pilot-mode.md) first. It says what the workspace you are
about to create is and is not.

```bash
export DATABASE_URL=postgres://…            # the pilot database
pnpm --filter @vuarau/api ops:pilot help
```

---

## 1. The depot

```bash
pnpm --filter @vuarau/api ops:pilot workspaces
pnpm --filter @vuarau/api ops:pilot workspace --name "Vựa rau Bình Điền"
```

Prints the new id. Keep it — every later command takes it.

Creating a depot is not a command and has no procedure: a workspace is the tenant
boundary, and an endpoint that creates one is an endpoint that provisions tenants
over HTTP. It needs shell access, which is its own authorization boundary.

Re-running with the same `--id` is safe and **does not rename** an existing depot.
Renaming a live depot is a decision, not a side effect of a corrected argument.

## 2. The people

Each participant needs a Supabase account and a membership. The account is created
in the Supabase dashboard; sign-up is off in the app (`shouldCreateUser: false`), so
an email nobody provisioned cannot get a code.

```bash
pnpm --filter @vuarau/api ops:pilot member \
  --workspace <workspaceId> \
  --subject   <supabase user id> \
  --name      "Chủ vựa" \
  --role      owner
```

`--subject` is the Supabase **user id**, which becomes the `sub` of the token they
sign in with (BR-AUTH-005). Not their email.

Give the worker being observed the role they actually hold. `owner` and
`accountant` carry `debt.adjust` and `sale.void` — the two ways to move money with
no new trade — and the tool says so when you use them. The role table beyond
`debt.adjust` is still a developer's default (ASM-017), and a pilot is the first
time anybody holds one in anger.

## 3. Their customers

A pilot needs the worker's **own** customers. Recognising a name is most of the
speed; a stranger's list measures reading rather than recording, and invalidates
every timing in [pilot-worksheet.md](pilot-worksheet.md).

Ask the owner for the list however they can produce it — a photo of the notebook
page typed up, a contacts export, a message. Save it as UTF-8 CSV:

```csv
ten,dien_thoai,ghi_chu
Chị Lan chợ Bình Điền,0901234567,khách quen
"Vựa Ba Hưng, chợ Đầu mối",0912345678,
Anh Tuấn,,mới mở
```

`ten` or `name` is required. `dien_thoai`/`phone` and `ghi_chu`/`note` are
optional. A BOM, CRLF and quoted fields containing commas are all handled, because
that is what a spreadsheet emits.

**Dry run first — it is the default:**

```bash
pnpm --filter @vuarau/api ops:pilot customers \
  --workspace <workspaceId> --actor <actorId> --file customers.csv
```

It prints every row it would create, with the exact id, and writes nothing. One
unreadable row refuses the whole file and names the line and the column: a
half-imported list is worse than a refused one, because you cannot tell where it
stopped (BR-CUSTOMER-005).

**Then commit:**

```bash
pnpm --filter @vuarau/api ops:pilot customers \
  --workspace <workspaceId> --actor <actorId> --file customers.csv \
  --commit --report import-report.txt
```

Ids and idempotency keys are derived from the file, so re-running the same file is
a replay rather than a second customer list. If a commit stops part-way, the report
names every row that exists, and re-running finishes the rest.

Customers are created through the real `CreateCustomer` command — same validation,
same audit trail, same idempotency claim as one typed in the browser. No row is
hand-inserted.

## 4. What is deliberately not imported

**Balances.** The import creates customers and nothing else. An opening balance is
money: it needs `debt.adjust`, and it is `AdjustCustomerDebt` with
`reasonCode: opening_balance` (BR-ACCOUNT-010) — one deliberate command per
customer, with an actor and a reason attached, not a spreadsheet column.

For a shadow pilot, do not import them at all. Every balance starts at zero and
comes from something recorded during the session, which is what makes the resulting
numbers readable: whatever a customer owes at the end is exactly what was entered
in front of you.

**Sales and payments.** There is no import for either, and there will not be. They
are the events the system exists to record; a file of them would be financial
history with no command and no actor behind it.

## 5. Check the whole thing at once

```bash
pnpm --filter @vuarau/api ops:pilot-readiness --example > pilot.json   # then fill it in
pnpm --filter @vuarau/api ops:pilot-readiness --config pilot.json
```

Twelve checks, each pass or fail: the database, the migrations, the depot, who
holds `owner`, the observed worker's role, the imported customers, whether any
demo customer got in, what the worker's token resolves to, what the picker will
show them, the recorded ASM-023 answer, the pilot mode, and whether anybody can
correct a mistake.

`pilot.json` is **yours**, not the repository's. It carries the depot owner's
recorded answer, and a committed one would be somebody's signature as test data.
Keep it beside the signed worksheet and do not add it to git.

If the owner **rejected** posting-time debt recognition, readiness fails and the
pilot stops. That is not a bug to work around: every `sale_posting` entry recorded
afterwards would carry a `transactionTime` the owner says is wrong, on an
append-only ledger, with no repair the design allows.

## 6. If a sale goes in wrong during the session

Open the posted Sale detail. An owner or accountant with `sale.void` records a
reason, then chooses **void only** or **void and create replacement**. The latter
opens a prefilled new Sale that must be checked and posted as a distinct document.
Everything goes through the real `VoidSale` → optional `CreateSaleDraft` →
`PostSale` commands — same permission, same audit trail, same compensating entry
(BR-OPS-003). No row is edited and no ledger row is written by hand.

`ops:correct-sale` remains a support tool for diagnosing or recovering an
exceptional operational incident; it is not the normal worker workflow.

Do this **between** transactions, not during one. The worker is being timed.

## 7. Before the first session

- [ ] The depot exists, and only the pilot participants are members.
- [ ] Each participant can sign in — check on the actual phone, on the actual
      connection, before the worker is standing there.
- [ ] Their customers are imported, and the worker recognises the names on screen.
- [ ] The four ASM-002 questions have been put to the **owner**
      ([worksheet](../09-decisions/ASM-002-debt-recognition-worksheet.md)). This is
      the one that cannot be done afterwards.
- [ ] The owner has been told, in the words in
      [pilot-mode.md](pilot-mode.md), that their notebook is still the book.
- [ ] `ops:pilot-readiness` passes, with the owner's answer recorded in it.
- [ ] The [device smoke check](../11-operations/device-smoke-check.md) has been
      run on the actual phone, over mobile data. Not emulated.

## Related

- [pilot-mode.md](pilot-mode.md) — what this pilot is and is not
- [pilot-worksheet.md](pilot-worksheet.md) — the session sheet
- [validation-plan.md](validation-plan.md) — what the session settles
- [../04-business-rules/customer-rules.md](../04-business-rules/customer-rules.md) — BR-CUSTOMER-005
- [../11-operations/deployment-contract.md](../11-operations/deployment-contract.md) — the environment it all runs in
- [../11-operations/device-smoke-check.md](../11-operations/device-smoke-check.md) — proving it works on a phone
