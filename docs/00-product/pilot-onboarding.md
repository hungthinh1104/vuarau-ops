# Preparing a real shadow-pilot workspace

This is the operator path for M23. The notebook remains operational truth. Use
real, individual Supabase accounts; never seed the development fixtures into this
workspace and never share an account.

## 1. Bootstrap the workspace and first owner

Choose the workspace and actor UUIDs once and retain them in the private pilot
evidence packet. The default is a dry run:

```bash
pnpm --filter @vuarau/api ops:pilot bootstrap \
  --workspace <workspace-uuid> \
  --name "<depot name>" \
  --actor <owner-actor-uuid> \
  --subject <real-supabase-user-id> \
  --owner-name "<owner name>"
```

Review the output, then repeat the identical command with `--commit`. The write is
one transaction: workspace, local actor, active owner membership and one
`membership.added` audit record. Its command/audit identity is deterministic, so
the exact retry is a replay. The tool refuses demo/fixture/test identities and
does not rename, reactivate or change the role of an existing workspace.

After the first owner can sign in, add every other member through the authenticated
workspace member UI/API. That is the normal command path and records the acting
owner. Do not use SQL or the bootstrap command to change later memberships.

## 2. Review least privilege

```bash
pnpm --filter @vuarau/api ops:pilot review --workspace <workspace-uuid>
```

The output includes active/revoked state, role and every effective permission.
Review it with the owner against ASM-017, explicitly list the intended owner actor
IDs for ASM-018, remove unintended owners through the member UI, then run the
review again. A shared Supabase subject, an unexplained owner, or a role chosen for
convenience blocks the pilot.

## 3. Dry-run and import Customers

```csv
ten,dien_thoai,ghi_chu
Chị Lan,0901234567,khách quen
```

```bash
pnpm --filter @vuarau/api ops:pilot customers \
  --workspace <workspace-uuid> --actor <operator-actor-uuid> \
  --file /secure/customers.csv
```

The report shows input, accepted and rejected row counts; the invariant is
`input = accepted + rejected`. It identifies malformed rows, in-file duplicate
names and names already present in the workspace. Duplicate candidates are never
merged. Any validation problem keeps the whole file read-only.

After review, repeat with `--commit --report /secure/customer-import.txt`.
Every accepted row executes `CreateCustomer`. Customer, command and idempotency
identities are derived from workspace + file + row; a retry replays rather than
duplicates. Runtime refusals are reported per row, so no outcome is left unknown.

## 4. Dry-run and import Products

```csv
ten,ten_khac,don_vi
Cà chua,cà bi|tomato,kg
Rau muống,rau muon,bo
```

Use the same command shape with `products`. Aliases are separated by `|`; units
must be one of `kg, gram, lang, bo, thung, ro, kien, cai`.

```bash
pnpm --filter @vuarau/api ops:pilot products \
  --workspace <workspace-uuid> --actor <operator-actor-uuid> \
  --file /secure/products.csv
pnpm --filter @vuarau/api ops:pilot products \
  --workspace <workspace-uuid> --actor <operator-actor-uuid> \
  --file /secure/products.csv --commit --report /secure/product-import.txt
```

Rows execute `CreateProduct`; the importer does not insert catalog rows directly
and does not create a price, stock quantity or conversion.

## 5. Opening balances

The CSV formats contain no balance column. For a shadow pilot, leave opening
balances at zero. If a separately authorized workflow needs an opening balance,
use the existing `AdjustCustomerDebt` command with `reasonCode:
opening_balance`, a required explanation and a permitted owner/accountant. Never
insert a customer-account entry or projection directly.

## 6. Readiness

Create the private declaration, fill it from signed external evidence, and set the
exact deployed build identity:

```bash
pnpm --filter @vuarau/api ops:pilot-readiness --example > /secure/pilot.json
APP_RELEASE_SHA=<40-character-deployed-sha> \
  pnpm --filter @vuarau/api ops:pilot-readiness --config /secure/pilot.json
```

The declaration includes ASM-023/024/025, ASM-017/018, ASM-030 and the
ASM-032/033/034 quality-policy reviews, plus the real two-user Supabase smoke,
deployment/phone evidence and provider recovery evidence. The quality reviews
reference the external [quality-policy worksheet](../09-decisions/m23-quality-policy-worksheet.md); configured grades alone are not policy evidence. Passed
deployment evidence confirms the clean PostgreSQL 17 deployment, private
API/database, trusted proxy, global edge limiter, health, safe observability and
absence of server secrets from the browser/runtime. Passed recovery evidence records
the provider/recovery point/backup identifier, start/end, measured RPO/RTO,
migration state, integrity and three reconciliations. A repository may be
technically healthy while the final line still says
`pilot readiness: BLOCKED/PENDING`; that is the correct result until human and
provider evidence exists.

Then complete the real-phone smoke check and the frozen H2–H6 field protocol.
Never commit the filled declaration, customer/Product CSVs, signed worksheets or
provider evidence.

## Related

- [M23 pilot contract](m23-pilot-contract.md)
- [pilot mode](pilot-mode.md)
- [M23 field protocol](m23-field-validation-protocol.md)
- [deployment and recovery evidence](../11-operations/m23-deployment-recovery-evidence.md)
