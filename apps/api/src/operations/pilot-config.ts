import { z } from "zod";
import { actorIdSchema, workspaceIdSchema, workspaceRoleSchema } from "@vuarau/domain-contracts";

/**
 * What the operator declares about a pilot, so a machine can check it.
 *
 * Everything here is somebody's stated intent — which depot, which person, which
 * role, and what the owner said about when debt arises. `ops:pilot-readiness`
 * compares each line against the database and refuses to start a pilot where they
 * disagree.
 *
 * It is a **file the operator writes**, not something this repository ships.
 * Committing a filled-in one would be committing an owner's signature as test
 * data, which is the specific thing not to do: the whole value of ASM-023 is that
 * a person said it, and a fixture that says it instead is a lie with a checkmark.
 */

/**
 * ASM-023 — the depot owner's answer to the four questions in
 * `docs/09-decisions/ASM-002-debt-recognition-worksheet.md`.
 *
 * `accepted` means they agreed a customer starts owing at chốt đơn — the posting
 * moment ADR-0014 records. `rejected` means they did not, and the pilot stops:
 * every `sale_posting` entry recorded afterwards would carry a `transactionTime`
 * that is wrong, on an append-only ledger, with no repair the design permits.
 */
export const debtRecognitionConfirmationSchema = z.object({
  /** Who said it. A person, not a role — somebody has to be answerable. */
  ownerName: z.string().trim().min(1),
  /** When. `YYYY-MM-DD`; a confirmation with no date cannot be found again. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  decision: z.enum(["accepted", "rejected"]),
  /** Their words, especially any "yes, but". Free text, and read by a human. */
  notes: z.string().trim().default(""),
  /**
   * Where the signed worksheet is — a scan, a photo, a file in a drive. Required,
   * because a confirmation whose evidence nobody can produce is a claim.
   */
  worksheetReference: z.string().trim().min(1),
});
export type DebtRecognitionConfirmation = z.infer<typeof debtRecognitionConfirmationSchema>;

const ownerDecisionSchema = debtRecognitionConfirmationSchema;
const reviewSchema = z.object({
  reviewerName: z.string().trim().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  decision: z.enum(["accepted", "rejected"]),
  worksheetReference: z.string().trim().min(1),
  notes: z.string().trim().default(""),
});

const authenticationSmokeSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("passed"),
    releaseSha: z.string().regex(/^[0-9a-f]{40}$/),
    evidenceReference: z.string().trim().min(1),
    sameTabUserIsolation: z.literal(true),
    tokenRefresh: z.literal(true),
    sessionExpiry: z.literal(true),
    remoteSignOut: z.literal(true),
    unknownSubjectRejected: z.literal(true),
    revokedMembershipRejected: z.literal(true),
  }),
  z.object({
    status: z.literal("pending"),
    owner: z.string().trim().min(1),
    trigger: z.string().trim().min(1),
  }),
]);

const deploymentEvidenceSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("passed"),
    releaseSha: z.string().regex(/^[0-9a-f]{40}$/),
    evidenceReference: z.string().trim().min(1),
    realPhoneSmoke: z.literal(true),
    managedPostgres17: z.literal(true),
    cleanDatabaseDeployment: z.literal(true),
    noDemoOrFixtureData: z.literal(true),
    privateApi: z.literal(true),
    privateDatabase: z.literal(true),
    trustedProxyConfigured: z.literal(true),
    globalEdgeRateLimitConfigured: z.literal(true),
    healthAndReadinessPassed: z.literal(true),
    safeMetricsAndLogging: z.literal(true),
    noPublicServerSecrets: z.literal(true),
    noJwtSecret: z.literal(true),
    noSupabaseServiceRoleKey: z.literal(true),
  }),
  z.object({
    status: z.literal("pending"),
    owner: z.string().trim().min(1),
    trigger: z.string().trim().min(1),
  }),
]);

const recoveryEvidenceSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("passed"),
    releaseSha: z.string().regex(/^[0-9a-f]{40}$/),
    provider: z.string().trim().min(1),
    recoveryPoint: z.string().trim().min(1),
    pitrOrBackupIdentifier: z.string().trim().min(1),
    restoreStartedAt: z.iso.datetime(),
    restoreCompletedAt: z.iso.datetime(),
    measuredRpoMinutes: z.number().nonnegative().max(15),
    measuredRtoMinutes: z.number().positive().max(60),
    migrationState: z.literal("current"),
    integrityResult: z.literal("healthy"),
    customerReconciliation: z.literal("consistent"),
    supplierReconciliation: z.literal("consistent"),
    inventoryReconciliation: z.literal("consistent"),
    operator: z.string().trim().min(1),
    incidentOrDeviationNotes: z.string().trim(),
    providerEvidenceReference: z.string().trim().min(1),
    restoreDrillReference: z.string().trim().min(1),
  }),
  z.object({
    status: z.literal("pending"),
    owner: z.string().trim().min(1),
    trigger: z.string().trim().min(1),
  }),
]);

export const pilotConfigSchema = z.object({
  /**
   * Only `shadow` is implemented. `operational` is refused rather than absent, so
   * an operator who believes they are running one is told what it would cost
   * (docs/00-product/pilot-mode.md) instead of finding the word accepted.
   */
  mode: z.enum(["shadow", "operational"]),
  /** Exact immutable build deployed for this evidence packet. */
  releaseSha: z.string().regex(/^[0-9a-f]{40}$/, "expected a 40-character git SHA"),
  workspaceId: workspaceIdSchema,
  /** What the depot calls itself. Checked against the row, to catch a wrong id. */
  workspaceName: z.string().trim().min(1),

  /** The person who will be observed. */
  actor: z.object({
    /** The Supabase user id their token carries as `sub` (BR-AUTH-005). */
    supabaseUserId: z.string().trim().min(1),
    expectedActorId: actorIdSchema,
    /**
     * Named explicitly, never inferred from the row. The point of the check is to
     * catch a role nobody chose — ASM-018 backfilled every membership as `owner`.
     */
    expectedRole: workspaceRoleSchema,
  }),

  /**
   * Every actor allowed to hold `owner` in this depot. Usually one, sometimes
   * none if the owner does not use the software themselves.
   *
   * Declared rather than counted: "how many owners are there" has no right answer
   * a script can know, but "which ones did you mean" does, and an owner nobody
   * listed is exactly the finding this exists to produce (ASM-017, ASM-018).
   */
  allowedOwnerActorIds: z.array(actorIdSchema),

  debtRecognitionConfirmation: debtRecognitionConfirmationSchema,
  commercialRecognitionConfirmation: ownerDecisionSchema,
  supplierPayableRecognitionConfirmation: ownerDecisionSchema,
  rolePermissionReview: reviewSchema,
  ownerMembershipReview: reviewSchema,
  dataSharingRetentionReview: reviewSchema,
  qualityGradePolicyReview: reviewSchema,
  receivingQualitySemanticsReview: reviewSchema,
  qualityRoleReview: reviewSchema,
  authenticationSmoke: authenticationSmokeSchema,
  deploymentEvidence: deploymentEvidenceSchema,
  recoveryEvidence: recoveryEvidenceSchema,
});
export type PilotConfig = z.infer<typeof pilotConfigSchema>;

/** A blank one, for `ops:pilot-readiness --example`. Filled in by a person. */
export const EXAMPLE_PILOT_CONFIG = {
  mode: "shadow",
  releaseSha: "0000000000000000000000000000000000000000",
  workspaceId: "00000000-0000-0000-0000-000000000000",
  workspaceName: "Vựa rau …",
  actor: {
    supabaseUserId: "",
    expectedActorId: "00000000-0000-0000-0000-000000000000",
    expectedRole: "sales",
  },
  allowedOwnerActorIds: [],
  debtRecognitionConfirmation: {
    ownerName: "",
    date: "",
    decision: "accepted",
    notes: "",
    worksheetReference: "",
  },
  commercialRecognitionConfirmation: {
    ownerName: "",
    date: "",
    decision: "accepted",
    notes: "",
    worksheetReference: "",
  },
  supplierPayableRecognitionConfirmation: {
    ownerName: "",
    date: "",
    decision: "accepted",
    notes: "",
    worksheetReference: "",
  },
  rolePermissionReview: {
    reviewerName: "",
    date: "",
    decision: "accepted",
    worksheetReference: "",
    notes: "",
  },
  ownerMembershipReview: {
    reviewerName: "",
    date: "",
    decision: "accepted",
    worksheetReference: "",
    notes: "",
  },
  dataSharingRetentionReview: {
    reviewerName: "",
    date: "",
    decision: "accepted",
    worksheetReference: "",
    notes: "",
  },
  qualityGradePolicyReview: {
    reviewerName: "",
    date: "",
    decision: "accepted",
    worksheetReference: "",
    notes: "",
  },
  receivingQualitySemanticsReview: {
    reviewerName: "",
    date: "",
    decision: "accepted",
    worksheetReference: "",
    notes: "",
  },
  qualityRoleReview: {
    reviewerName: "",
    date: "",
    decision: "accepted",
    worksheetReference: "",
    notes: "",
  },
  authenticationSmoke: {
    status: "pending",
    owner: "",
    trigger: "",
  },
  deploymentEvidence: {
    status: "pending",
    owner: "",
    trigger: "",
  },
  recoveryEvidence: {
    status: "pending",
    owner: "",
    trigger: "",
  },
} as const;

export type ParsedPilotConfig =
  | { readonly ok: true; readonly config: PilotConfig }
  | { readonly ok: false; readonly problems: readonly string[] };

export function readPilotConfig(raw: string): ParsedPilotConfig {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    return { ok: false, problems: [`not valid JSON: ${(error as Error).message}`] };
  }

  const result = pilotConfigSchema.safeParse(parsedJson);
  if (result.success) {
    return { ok: true, config: result.data };
  }
  return {
    ok: false,
    problems: result.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
    ),
  };
}
