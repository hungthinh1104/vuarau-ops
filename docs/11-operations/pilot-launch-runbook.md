# Shadow pilot launch runbook

This runbook prepares one **new, isolated** shadow-pilot environment. It does not
authorise a session by itself: an observed session starts only after repository
and pilot readiness both pass, the real-phone smoke check is 10/10, and the human
gates below are recorded.
Do not put a filled `pilot.json`, customer CSV, password, token, signed worksheet,
or customer details in this repository.

## Stop rules

Stop and preserve the evidence if any command fails. In particular: do not alter
`drizzle.__drizzle_migrations`; do not use `db:seed`; do not repair a ledger row or
posted sale directly; and do not turn a readiness failure into a warning.

| Database found                     | Correct action                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| New and empty                      | Use it for the pilot, then apply this checkout's migrations.                                   |
| Development database safe to reset | Keep it separate from the pilot; reset only under its own approved development procedure.      |
| Has data that must be preserved    | Stop. Back it up and investigate; never reset or rewrite its migration history for this pilot. |

If migration inspection reports an unknown migration hash, stop. It may contain a
schema change this checkout does not carry. Create a new pilot database instead of
inventing migration history.

## Bootstrap sequence

Run all commands in the repository root with deployment values supplied outside
the repository. Expected output is descriptive; identifiers and customer names
must stay out of logs shared with the project.

1. Configure the API environment with `APP_ENV=pilot`, `DATABASE_URL`,
   `SUPABASE_JWT_ISSUER`, `SUPABASE_JWKS_URL`, and `PUBLIC_APP_ORIGIN`. Configure
   the Next build separately with `NEXT_PUBLIC_SUPABASE_URL`, a publishable
   Supabase key, and `NEXT_PUBLIC_API_ORIGIN`. Do not set `SUPABASE_JWT_SECRET` or
   `NEXT_PUBLIC_E2E_AUTH_BRIDGE`.

   ```bash
   pnpm --filter @vuarau/api ops:check-env
   ```

   Expected: `environment is usable`. Stop on any listed variable.

2. Apply the repository migrations to the **empty pilot database**.

   ```bash
   pnpm db:migrate
   ```

   Expected: each migration applies once and exits 0. Do not run `pnpm db:seed`.
   Keep any existing development database untouched for a separate investigation.

3. Deploy/start the API and Next application. Confirm `/health/live` and
   `/health/ready` through the deployment, then check the real Supabase project.

   ```bash
   pnpm --filter @vuarau/api ops:check-supabase
   ```

   Expected: project reachable, publishable key accepted, email/password enabled,
   public sign-up disabled, email confirmation disabled while SMTP is unavailable,
   JWKS keys present, and issuer matching. Confirm anonymous signup is disabled.
   The application exposes password login only; do not claim hosted OTP/Magic Link
   capability is disabled because the public settings endpoint cannot prove it.
   A later run with a real device token must also pass verifier validation. See
   [pilot-authentication.md](pilot-authentication.md).

4. Create the isolated workspace and provision the real Supabase subject. Use the
   least-privilege default `sales` for the observed worker; use an existing
   accountant or declared owner for correction, never an extra owner for
   convenience.

   ```bash
   pnpm --filter @vuarau/api ops:pilot bootstrap --workspace <workspace-id> \
     --name "<pilot workspace>" --actor <owner-actor-id> \
     --subject <owner-supabase-subject> --owner-name "<owner display name>"
   # review, repeat the exact bootstrap with --commit, then add the worker
   # through the authenticated membership UI/API
   pnpm --filter @vuarau/api ops:pilot review --workspace <workspace-id>
   pnpm --filter @vuarau/api ops:pilot-readiness --example > /secure/path/pilot.json
   pnpm --filter @vuarau/api ops:pilot-readiness --config /secure/path/pilot.json
   ```

   Expected: readiness remains red until real customers and the ASM-023 record
   exist. `pilot.json` must declare the workspace, worker subject/actor, expected
   role, and explicitly allowed owner actor IDs.

5. Import only the worker's real customer CSV. First inspect the dry run, then
   commit the exact file only if its rows and warnings are understood.

   ```bash
   pnpm --filter @vuarau/api ops:pilot customers --workspace <workspace-id> \
     --actor <operator-actor-id> --file /secure/path/customers.csv
   pnpm --filter @vuarau/api ops:pilot customers --workspace <workspace-id> \
     --actor <operator-actor-id> --file /secure/path/customers.csv --commit
   pnpm --filter @vuarau/api ops:pilot-readiness --config /secure/path/pilot.json
   ```

   Expected: dry run says `Nothing was written`; commit reports created/replayed
   rows; readiness finds customers and no demo/fixture names. If a dry run or
   rehearsal touches the pilot workspace, discard that workspace and repeat the
   clean bootstrap before observation.

6. Complete ASM-023/024/025 and the ASM-017/018/030/032/033/034 reviews, then
   classify ASM-035/036/037/038 with the cross-dimension correction worksheet.
   Record dates, people, notes and worksheet references in the private `pilot.json`;
   do not commit signed material. A populated QualityGrade list is not a substitute
   for ASM-032/033/034 evidence. For ASM-035–038, choose only:
   `excluded_from_shadow_scope` with `stopIfEncountered: true`,
   `resolved_in_release` bound to the exact frozen SHA, or `blocked`. Also keep
   `authenticationSmoke` and `recoveryEvidence` pending until the real checks have
   actually run.

   ```bash
   pnpm --filter @vuarau/api ops:pilot-readiness --config /secure/path/pilot.json
   ```

   Expected: every repository and external check passes. A rejected recognition or
   quality-policy answer exits non-zero. A blocked ASM-035–038 scenario exits
   non-zero; an excluded scenario passes readiness only because the session must
   stop if that event appears. Record contradictions; do not create fake goods or
   money movements merely to make readiness green.

7. Complete [device-smoke-check.md](device-smoke-check.md) on the worker's normal
   phone over mobile data. A failure at step 10 stops the pilot. Then use the
   separate [pilot-session-runbook.md](pilot-session-runbook.md) for the observed
   15–20 transaction session.

## Dry run and reset

Use a separate workspace for a facilitator dry run: one-line sale, three-line
sale, pre-post correction, payment, and dropped-response retry. It tests the
facilitator, stopwatch, worksheet, assistance labels, comparison, and reset—not
H2. Reset by discarding the dry-run workspace or creating a new clean pilot
workspace. Never delete posted rows; use Sale detail's void/replacement workflow
where a correction is genuinely required, then return the intended pilot workspace
to a fully passing readiness result. `ops:correct-sale` is a support fallback only.

## Backup declaration

Before launch, complete the blank declaration in
[deployment-contract.md](deployment-contract.md). `not rehearsed` is allowed only
for shadow mode while the notebook remains authoritative, the workspace is
isolated, and pilot data is not used for financial decisions. Do not claim a
restore rehearsal without a dated execution record.

## Human gates still requiring an operator

- Create/configure the Supabase project, disable public/anonymous signup, expose no
  application recovery/passwordless action, then verify two real pre-provisioned
  password accounts in one browser tab.
- Create the real user, collect their Supabase subject, and choose roles with the
  depot owner.
- Obtain and retain the ASM-023 worksheet outside Git.
- Declare backup ownership/mechanism/schedule/retention and, if applicable, the
  last restore rehearsal date.
- Execute the phone smoke and observed session; no command can manufacture H2
  evidence.
