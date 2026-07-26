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

## 5. Before the first session

- [ ] The depot exists, and only the pilot participants are members.
- [ ] Each participant can sign in — check on the actual phone, on the actual
      connection, before the worker is standing there.
- [ ] Their customers are imported, and the worker recognises the names on screen.
- [ ] The four ASM-002 questions have been put to the **owner**
      ([worksheet](../09-decisions/ASM-002-debt-recognition-worksheet.md)). This is
      the one that cannot be done afterwards.
- [ ] The owner has been told, in the words in
      [pilot-mode.md](pilot-mode.md), that their notebook is still the book.

## Related

- [pilot-mode.md](pilot-mode.md) — what this pilot is and is not
- [pilot-worksheet.md](pilot-worksheet.md) — the session sheet
- [validation-plan.md](validation-plan.md) — what the session settles
- [../04-business-rules/customer-rules.md](../04-business-rules/customer-rules.md) — BR-CUSTOMER-005
