import { readFileSync } from "node:fs";
import { z } from "zod";

/**
 * M24 policy questions are external evidence, not seeded product configuration.
 * This packet makes the evidence boundary machine-readable without supplying an
 * answer for a depot.
 */
export const M24_POLICY_IDS = [
  "ASM-039",
  "ASM-040",
  "ASM-041",
  "ASM-042",
  "ASM-043",
  "ASM-044",
  "ASM-045",
  "ASM-046",
  "ASM-047",
  "ASM-048",
] as const;

export const POLICY_CLOSURE_DISPOSITIONS = [
  "decided_for_release",
  "excluded_from_scope",
  "blocked",
  "needs_more_evidence",
] as const;

export const EVIDENCE_STATES = [
  "proposed",
  "policy_decided",
  "technically_implemented",
  "repository_verified",
  "field_validated",
  "production_accepted",
] as const;

const policyIdSchema = z.enum(M24_POLICY_IDS);
const dispositionSchema = z.enum(POLICY_CLOSURE_DISPOSITIONS);
const evidenceStateSchema = z.enum(EVIDENCE_STATES);

const participantSchema = z.object({
  role: z.string().trim().min(1),
  name: z.string().trim().min(1),
});

const observedCaseSchema = z.object({
  kind: z.enum(["normal", "partial_or_exception", "correction"]),
  description: z.string().trim().min(1),
  evidenceReference: z.string().trim().min(1),
});

export const policyClosureEntrySchema = z
  .object({
    policyId: policyIdSchema,
    participants: z.array(participantSchema).min(1),
    depotContext: z.string().trim().min(1),
    observedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
    releaseOrProcessBoundary: z.string().trim().min(1),
    cases: z.array(observedCaseSchema).min(3),
    participantWording: z.string().trim().min(1),
    decisionSummary: z.string().trim().min(1),
    canonicalEffect: z.string().trim().min(1),
    correctionPath: z.string().trim().min(1),
    reconciliation: z.string().trim().min(1),
    evidenceReference: z.string().trim().min(1),
    disposition: dispositionSchema,
    evidenceState: evidenceStateSchema,
  })
  .superRefine((entry, ctx) => {
    const observedKinds = new Set(entry.cases.map((observedCase) => observedCase.kind));
    for (const kind of ["normal", "partial_or_exception", "correction"] as const) {
      if (!observedKinds.has(kind)) {
        ctx.addIssue({
          code: "custom",
          path: ["cases"],
          message: `missing ${kind} case`,
        });
      }
    }
    if (
      entry.disposition === "decided_for_release" &&
      evidenceStateRank(entry.evidenceState) < evidenceStateRank("policy_decided")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["evidenceState"],
        message: "decided_for_release requires policy_decided evidence or a later state",
      });
    }
  });

export const policyClosurePacketSchema = z
  .object({
    kind: z.literal("M24_POLICY_CLOSURE"),
    packetVersion: z.literal(1),
    createdAt: z.iso.datetime(),
    releaseOrProcessBoundary: z.string().trim().min(1),
    items: z.array(policyClosureEntrySchema).length(M24_POLICY_IDS.length),
  })
  .superRefine((packet, ctx) => {
    const ids = packet.items.map((item) => item.policyId);
    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== M24_POLICY_IDS.length) {
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "items must contain each ASM-039–ASM-048 exactly once",
      });
    }
    for (const policyId of M24_POLICY_IDS) {
      if (!uniqueIds.has(policyId)) {
        ctx.addIssue({
          code: "custom",
          path: ["items"],
          message: `missing ${policyId}`,
        });
      }
    }
  });

export type PolicyClosureEntry = z.infer<typeof policyClosureEntrySchema>;
export type PolicyClosurePacket = z.infer<typeof policyClosurePacketSchema>;

const EVIDENCE_STATE_RANK: Record<(typeof EVIDENCE_STATES)[number], number> = {
  proposed: 0,
  policy_decided: 1,
  technically_implemented: 2,
  repository_verified: 3,
  field_validated: 4,
  production_accepted: 5,
};

function evidenceStateRank(state: (typeof EVIDENCE_STATES)[number]): number {
  return EVIDENCE_STATE_RANK[state];
}

export type ParsedPolicyClosurePacket =
  | { readonly ok: true; readonly packet: PolicyClosurePacket }
  | { readonly ok: false; readonly problems: readonly string[] };

export function readPolicyClosurePacket(raw: string): ParsedPolicyClosurePacket {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    return { ok: false, problems: [`not valid JSON: ${(error as Error).message}`] };
  }

  const result = policyClosurePacketSchema.safeParse(parsedJson);
  if (result.success) return { ok: true, packet: result.data };
  return {
    ok: false,
    problems: result.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
    ),
  };
}

export type PolicyClosureAssessment = {
  readonly policyDecisionReady: boolean;
  readonly fieldValidated: boolean;
  readonly productionAccepted: boolean;
  readonly unresolved: readonly string[];
};

export function assessPolicyClosure(packet: PolicyClosurePacket): PolicyClosureAssessment {
  const policyDecisionReady = packet.items.every(
    (item) => item.disposition === "decided_for_release",
  );
  const fieldValidated = packet.items.every(
    (item) => evidenceStateRank(item.evidenceState) >= evidenceStateRank("field_validated"),
  );
  const productionAccepted = packet.items.every(
    (item) => item.evidenceState === "production_accepted",
  );
  return {
    policyDecisionReady,
    fieldValidated,
    productionAccepted,
    unresolved: packet.items
      .filter((item) => item.disposition !== "decided_for_release")
      .map((item) => `${item.policyId}: ${item.disposition}`),
  };
}

/** A blank operator template. It is intentionally not a valid packet. */
export const EXAMPLE_M24_POLICY_CLOSURE_PACKET = {
  kind: "M24_POLICY_CLOSURE",
  packetVersion: 1,
  createdAt: "",
  releaseOrProcessBoundary: "",
  items: M24_POLICY_IDS.map((policyId) => ({
    policyId,
    participants: [{ role: "", name: "" }],
    depotContext: "",
    observedAt: "",
    releaseOrProcessBoundary: "",
    cases: [
      { kind: "normal", description: "", evidenceReference: "" },
      { kind: "partial_or_exception", description: "", evidenceReference: "" },
      { kind: "correction", description: "", evidenceReference: "" },
    ],
    participantWording: "",
    decisionSummary: "",
    canonicalEffect: "",
    correctionPath: "",
    reconciliation: "",
    evidenceReference: "",
    disposition: "needs_more_evidence",
    evidenceState: "proposed",
  })),
} as const;

const USAGE = `
usage: pnpm policy:closure --example
       pnpm policy:closure --config <policy-closure.json>

The packet is external field evidence. It is never written to the repository or
used as product configuration. Exit 0 means every M24 policy has an explicit
decided_for_release disposition; field validation and production acceptance are
reported separately and are never inferred from repository tests.
`.trim();

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return value === undefined || value.startsWith("--") ? "" : value;
}

function main(): void {
  if (process.argv.includes("--example")) {
    console.log(JSON.stringify(EXAMPLE_M24_POLICY_CLOSURE_PACKET, null, 2));
    return;
  }

  const configPath = flag("config");
  if (configPath === null || configPath.length === 0) {
    console.error(`--config <policy-closure.json> is required.\n\n${USAGE}`);
    process.exitCode = 2;
    return;
  }

  const parsed = readPolicyClosurePacket(readFileSync(configPath, "utf8"));
  if (!parsed.ok) {
    console.error("✗ the M24 policy packet is not usable:\n");
    for (const problem of parsed.problems) console.error(`  ${problem}`);
    process.exitCode = 2;
    return;
  }

  const assessment = assessPolicyClosure(parsed.packet);
  console.warn(`M24 policy closure: ${parsed.packet.releaseOrProcessBoundary}`);
  console.warn(`  policy decision ready: ${assessment.policyDecisionReady ? "yes" : "no"}`);
  console.warn(`  field validated: ${assessment.fieldValidated ? "yes" : "no"}`);
  console.warn(`  production accepted: ${assessment.productionAccepted ? "yes" : "no"}`);
  if (assessment.unresolved.length > 0) {
    console.warn("  unresolved:");
    for (const item of assessment.unresolved) console.warn(`    - ${item}`);
  }
  process.exitCode = assessment.policyDecisionReady ? 0 : 1;
}

if (process.argv[1]?.endsWith("scripts/m24-policy-closure.ts")) main();
