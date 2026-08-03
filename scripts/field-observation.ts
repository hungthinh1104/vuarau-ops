import { readFileSync } from "node:fs";
import { z } from "zod";

/**
 * Field observations are external evidence, not product configuration. The
 * packet records what a participant says or what an observer sees without
 * deciding whether it changes money, goods or a management metric.
 */
export const FIELD_OBSERVATION_KINDS = [
  "customer_order",
  "supply_commitment",
  "collection_or_arrival",
  "weighing",
  "inspection",
  "disposition",
  "sorting_or_grading",
  "packing",
  "packed_output",
  "order_allocation",
  "loading",
  "dispatch",
  "delivery_or_handover",
  "payment_or_cash_custody",
  "return",
  "claim_or_credit",
  "cost_observation",
  "pricing_observation",
  "reconciliation_observation",
] as const;

export const FIELD_OBSERVATION_CASE_KINDS = [
  "normal",
  "partial_or_exception",
  "correction",
] as const;

const observationKindSchema = z.enum(FIELD_OBSERVATION_KINDS);
const observationCaseKindSchema = z.enum(FIELD_OBSERVATION_CASE_KINDS);
const observationDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}(?:T[^\s]+)?$/, "expected YYYY-MM-DD or an ISO-like timestamp");

const participantSchema = z.object({
  role: z.string().trim().min(1),
  name: z.string().trim().min(1),
});

const observationSchema = z
  .object({
    observationId: z.string().trim().min(1),
    kind: observationKindSchema,
    caseKind: observationCaseKindSchema,
    observedAt: observationDateSchema,
    description: z.string().trim().min(1),
    participantWording: z.string().trim().min(1),
    evidenceReference: z.string().trim().min(1),
    /** Optional link to an existing canonical fact; it does not assert an effect. */
    canonicalReference: z.string().trim().min(1).optional(),
    relatedObservationId: z.string().trim().min(1).optional(),
  })
  .superRefine((observation, ctx) => {
    if (observation.caseKind === "correction" && observation.relatedObservationId === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["relatedObservationId"],
        message: "a correction must identify the observation it corrects",
      });
    }
    if (
      observation.relatedObservationId !== undefined &&
      observation.relatedObservationId === observation.observationId
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["relatedObservationId"],
        message: "an observation cannot relate to itself",
      });
    }
  });

export const fieldObservationPacketSchema = z
  .object({
    kind: z.literal("FIELD_OPERATIONAL_OBSERVATION"),
    packetVersion: z.literal(1),
    createdAt: z.iso.datetime(),
    releaseOrProcessBoundary: z.string().trim().min(1),
    workspaceReference: z.string().trim().min(1),
    observer: participantSchema,
    observations: z.array(observationSchema).min(1),
  })
  .superRefine((packet, ctx) => {
    const ids = new Set<string>();
    for (const [index, observation] of packet.observations.entries()) {
      if (ids.has(observation.observationId)) {
        ctx.addIssue({
          code: "custom",
          path: ["observations", index, "observationId"],
          message: "observationId must be unique within the packet",
        });
      }
      ids.add(observation.observationId);
    }

    for (const [index, observation] of packet.observations.entries()) {
      if (
        observation.relatedObservationId !== undefined &&
        !ids.has(observation.relatedObservationId)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["observations", index, "relatedObservationId"],
          message: "relatedObservationId must refer to an observation in this packet",
        });
      }
    }
  });

export type FieldObservationPacket = z.infer<typeof fieldObservationPacketSchema>;

export type ParsedFieldObservationPacket =
  | { readonly ok: true; readonly packet: FieldObservationPacket }
  | { readonly ok: false; readonly problems: readonly string[] };

export type FieldObservationAssessment = {
  readonly observationCount: number;
  readonly kindCounts: Readonly<Record<(typeof FIELD_OBSERVATION_KINDS)[number], number>>;
  readonly correctionCount: number;
  readonly canonicalReferenceCount: number;
};

export function readFieldObservationPacket(raw: string): ParsedFieldObservationPacket {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    return { ok: false, problems: [`not valid JSON: ${(error as Error).message}`] };
  }

  const result = fieldObservationPacketSchema.safeParse(parsedJson);
  if (result.success) return { ok: true, packet: result.data };
  return {
    ok: false,
    problems: result.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
    ),
  };
}

export function assessFieldObservationPacket(
  packet: FieldObservationPacket,
): FieldObservationAssessment {
  const kindCounts = Object.fromEntries(
    FIELD_OBSERVATION_KINDS.map((kind) => [
      kind,
      packet.observations.filter((observation) => observation.kind === kind).length,
    ]),
  ) as Record<(typeof FIELD_OBSERVATION_KINDS)[number], number>;

  return {
    observationCount: packet.observations.length,
    kindCounts,
    correctionCount: packet.observations.filter(
      (observation) => observation.caseKind === "correction",
    ).length,
    canonicalReferenceCount: packet.observations.filter(
      (observation) => observation.canonicalReference !== undefined,
    ).length,
  };
}

/** A blank operator template. It is intentionally not a valid packet. */
export const EXAMPLE_FIELD_OBSERVATION_PACKET = {
  kind: "FIELD_OPERATIONAL_OBSERVATION",
  packetVersion: 1,
  createdAt: "",
  releaseOrProcessBoundary: "",
  workspaceReference: "",
  observer: { role: "", name: "" },
  observations: [
    {
      observationId: "obs-001",
      kind: "customer_order",
      caseKind: "normal",
      observedAt: "",
      description: "",
      participantWording: "",
      evidenceReference: "",
      canonicalReference: "",
    },
  ],
} as const;

const USAGE = `
usage: pnpm field:observation --example
       pnpm field:observation --config <field-observations.json>

The packet is external field evidence. It is never written to the repository,
used as workspace policy, or interpreted as a money, goods or management effect.
Exit 0 means the packet is structurally usable; it does not mean the field
observation is validated or accepted for production.
`.trim();

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return value === undefined || value.startsWith("--") ? "" : value;
}

function main(): void {
  if (process.argv.includes("--example")) {
    console.log(JSON.stringify(EXAMPLE_FIELD_OBSERVATION_PACKET, null, 2));
    return;
  }

  const configPath = flag("config");
  if (configPath === null || configPath.length === 0) {
    console.error(`--config <field-observations.json> is required.\n\n${USAGE}`);
    process.exitCode = 2;
    return;
  }

  const parsed = readFieldObservationPacket(readFileSync(configPath, "utf8"));
  if (!parsed.ok) {
    console.error("✗ the field observation packet is not usable:\n");
    for (const problem of parsed.problems) console.error(`  ${problem}`);
    process.exitCode = 2;
    return;
  }

  const assessment = assessFieldObservationPacket(parsed.packet);
  console.warn(`Field observations: ${parsed.packet.releaseOrProcessBoundary}`);
  console.warn(`  workspace reference: ${parsed.packet.workspaceReference}`);
  console.warn(`  observations: ${assessment.observationCount}`);
  console.warn(`  corrections linked: ${assessment.correctionCount}`);
  console.warn(`  canonical references: ${assessment.canonicalReferenceCount}`);
  console.warn("  field validation: not run by automation");
}

if (process.argv[1]?.endsWith("scripts/field-observation.ts")) main();
