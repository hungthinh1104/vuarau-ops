"use client";

import { z } from "zod";

const PILOT_METRICS_PACKET_KIND = "VUA_RAU_PILOT_METRICS" as const;
const PILOT_METRICS_PACKET_VERSION = 1 as const;
const PILOT_METRICS_STORAGE_PREFIX = "vuarau:pilot-metrics:v1:";
const MAX_PILOT_METRIC_RECORDS = 200;
const FULL_GIT_SHA = /^[0-9a-f]{40}$/i;

export const PILOT_METRICS_UPDATED_EVENT = "vuarau:pilot-metrics-updated";

const nonNegativeIntegerSchema = z.number().int().nonnegative();
const nullableNonNegativeIntegerSchema = nonNegativeIntegerSchema.nullable();

export const pilotQuickSaleMetricRecordSchema = z
  .object({
    kind: z.literal("QUICK_SALE_WORKFLOW"),
    recordVersion: z.literal(1),
    releaseSha: z.string().regex(FULL_GIT_SHA),
    outcome: z.enum(["posted", "abandoned"]),
    startedAtEpochMs: nonNegativeIntegerSchema,
    endedAtEpochMs: nonNegativeIntegerSchema,
    durationMs: nonNegativeIntegerSchema,
    postAttemptLatencyMs: nullableNonNegativeIntegerSchema,
    saleLineCount: nullableNonNegativeIntegerSchema,
    validationErrorCount: nonNegativeIntegerSchema,
    lineEditCount: nonNegativeIntegerSchema,
    commandRetryCount: nonNegativeIntegerSchema,
    unknownOutcomeCount: nonNegativeIntegerSchema,
    recentCustomerSelected: nonNegativeIntegerSchema,
    customerSelectedFromSearch: nonNegativeIntegerSchema,
    customerCreatedInline: nonNegativeIntegerSchema,
    productCreatedInline: nonNegativeIntegerSchema,
    historicalProductSelected: nonNegativeIntegerSchema,
    historicalPriceOffered: nonNegativeIntegerSchema,
    historicalPriceApplied: nonNegativeIntegerSchema,
    historicalPriceChangedAfterApply: nonNegativeIntegerSchema,
    recalledPriceClearedAfterContextChange: nonNegativeIntegerSchema,
    priceRuleAppliedInSale: nonNegativeIntegerSchema,
    priceRuleChangedAfterApply: nonNegativeIntegerSchema,
    priceRuleClearedAfterContextChange: nonNegativeIntegerSchema,
  })
  .strict();
export type PilotQuickSaleMetricRecord = z.infer<typeof pilotQuickSaleMetricRecordSchema>;

export const pilotMetricsPacketSchema = z
  .object({
    kind: z.literal(PILOT_METRICS_PACKET_KIND),
    packetVersion: z.literal(PILOT_METRICS_PACKET_VERSION),
    releaseSha: z.string().regex(FULL_GIT_SHA),
    records: z.array(pilotQuickSaleMetricRecordSchema).max(MAX_PILOT_METRIC_RECORDS),
  })
  .strict()
  .superRefine((packet, ctx) => {
    for (const [index, record] of packet.records.entries()) {
      if (record.releaseSha !== packet.releaseSha) {
        ctx.addIssue({
          code: "custom",
          path: ["records", index, "releaseSha"],
          message: "record release SHA must match packet release SHA",
        });
      }
    }
  });
export type PilotMetricsPacket = z.infer<typeof pilotMetricsPacketSchema>;

export type PilotMetricsExport = PilotMetricsPacket & {
  readonly exportedAt: string;
};

export type PilotMetricsConfig = {
  readonly requested: boolean;
  readonly enabled: boolean;
  readonly releaseSha: string | null;
  readonly problem: string | null;
};

export type PilotMetricsReadResult =
  | { readonly ok: true; readonly packet: PilotMetricsPacket }
  | { readonly ok: false; readonly problem: string };

export type PilotMetricsExportResult =
  | { readonly ok: true; readonly value: PilotMetricsExport }
  | { readonly ok: false; readonly problem: string };

export function pilotMetricsConfigFromValues(
  enabledValue: string | undefined,
  releaseShaValue: string | undefined,
): PilotMetricsConfig {
  const requested = enabledValue === "1";
  if (!requested) {
    return { requested: false, enabled: false, releaseSha: null, problem: null };
  }

  const releaseSha = releaseShaValue?.trim().toLowerCase() ?? "";
  if (!FULL_GIT_SHA.test(releaseSha)) {
    return {
      requested: true,
      enabled: false,
      releaseSha: null,
      problem: "NEXT_PUBLIC_RELEASE_SHA must be the full 40-character Git commit SHA.",
    };
  }

  return { requested: true, enabled: true, releaseSha, problem: null };
}

/**
 * Pilot capture is opt-in at build time and fails closed when the deployed
 * artifact is not bound to an exact Git SHA. Field evidence from two releases
 * must never be silently combined.
 */
export function getPilotMetricsConfig(): PilotMetricsConfig {
  return pilotMetricsConfigFromValues(
    process.env.NEXT_PUBLIC_PILOT_METRICS,
    process.env.NEXT_PUBLIC_RELEASE_SHA,
  );
}

export function pilotMetricsStorageKey(releaseSha: string): string {
  return `${PILOT_METRICS_STORAGE_PREFIX}${releaseSha.toLowerCase()}`;
}

function emptyPacket(releaseSha: string): PilotMetricsPacket {
  return {
    kind: PILOT_METRICS_PACKET_KIND,
    packetVersion: PILOT_METRICS_PACKET_VERSION,
    releaseSha,
    records: [],
  };
}

function browserStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function readPilotMetricsPacket(
  releaseSha: string,
  storage: Storage | null = browserStorage(),
): PilotMetricsReadResult {
  if (!FULL_GIT_SHA.test(releaseSha)) {
    return { ok: false, problem: "Pilot metrics require a full Git release SHA." };
  }
  if (storage === null) {
    return { ok: false, problem: "Browser storage is unavailable on this device." };
  }

  let raw: string | null;
  try {
    raw = storage.getItem(pilotMetricsStorageKey(releaseSha));
  } catch {
    return { ok: false, problem: "Browser storage could not be read." };
  }
  if (raw === null) return { ok: true, packet: emptyPacket(releaseSha.toLowerCase()) };

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, problem: "Stored pilot metrics are not valid JSON." };
  }

  const parsed = pilotMetricsPacketSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return { ok: false, problem: "Stored pilot metrics do not match the expected packet shape." };
  }
  if (parsed.data.releaseSha !== releaseSha.toLowerCase()) {
    return { ok: false, problem: "Stored pilot metrics belong to a different release SHA." };
  }
  return { ok: true, packet: parsed.data };
}

function timestamp(snapshot: Readonly<Record<string, number>>, metric: string): number | null {
  const value = snapshot[metric];
  return Number.isInteger(value) && value > 0 ? value : null;
}

function count(snapshot: Readonly<Record<string, number>>, metric: string): number {
  const value = snapshot[metric];
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function positiveCount(snapshot: Readonly<Record<string, number>>, metric: string): number | null {
  const value = snapshot[metric];
  return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * Converts the in-memory workflow recorder into a closed, business-data-free
 * record. No snapshot key is spread into storage; every persisted field is named
 * here explicitly so adding a metric cannot accidentally widen the evidence
 * packet.
 */
export function summarizePilotWorkflowSnapshot(
  snapshot: Readonly<Record<string, number>>,
  releaseSha: string,
  capturedAtEpochMs: number = Date.now(),
): PilotQuickSaleMetricRecord | null {
  const normalizedSha = releaseSha.trim().toLowerCase();
  if (!FULL_GIT_SHA.test(normalizedSha)) return null;

  const startedAtEpochMs = timestamp(snapshot, "draft_started_at");
  const confirmedAtEpochMs = timestamp(snapshot, "post_confirmed_at");
  const abandoned = count(snapshot, "workflow_abandoned") > 0;
  if (startedAtEpochMs === null || (confirmedAtEpochMs !== null) === abandoned) return null;

  const endedAtEpochMs = confirmedAtEpochMs ?? capturedAtEpochMs;
  if (!Number.isInteger(endedAtEpochMs) || endedAtEpochMs < startedAtEpochMs) return null;

  const postAttemptedAtEpochMs = timestamp(snapshot, "post_attempted_at");
  const postAttemptLatencyMs =
    postAttemptedAtEpochMs !== null &&
    postAttemptedAtEpochMs >= startedAtEpochMs &&
    postAttemptedAtEpochMs <= endedAtEpochMs
      ? endedAtEpochMs - postAttemptedAtEpochMs
      : null;

  return pilotQuickSaleMetricRecordSchema.parse({
    kind: "QUICK_SALE_WORKFLOW",
    recordVersion: 1,
    releaseSha: normalizedSha,
    outcome: confirmedAtEpochMs === null ? "abandoned" : "posted",
    startedAtEpochMs,
    endedAtEpochMs,
    durationMs: endedAtEpochMs - startedAtEpochMs,
    postAttemptLatencyMs,
    saleLineCount: positiveCount(snapshot, "sale_line_count"),
    validationErrorCount: count(snapshot, "validation_error_count"),
    lineEditCount: count(snapshot, "line_edit_count"),
    commandRetryCount: count(snapshot, "command_retry_count"),
    unknownOutcomeCount: count(snapshot, "unknown_outcome_count"),
    recentCustomerSelected: count(snapshot, "recent_customer_selected"),
    customerSelectedFromSearch: count(snapshot, "customer_selected_from_search"),
    customerCreatedInline: count(snapshot, "customer_created_inline"),
    productCreatedInline: count(snapshot, "product_created_inline"),
    historicalProductSelected: count(snapshot, "historical_product_selected"),
    historicalPriceOffered: count(snapshot, "historical_price_offered"),
    historicalPriceApplied: count(snapshot, "historical_price_applied"),
    historicalPriceChangedAfterApply: count(snapshot, "historical_price_changed_after_apply"),
    recalledPriceClearedAfterContextChange: count(
      snapshot,
      "recalled_price_cleared_after_context_change",
    ),
    priceRuleAppliedInSale: count(snapshot, "price_rule_applied_in_sale"),
    priceRuleChangedAfterApply: count(snapshot, "price_rule_changed_after_apply"),
    priceRuleClearedAfterContextChange: count(snapshot, "price_rule_cleared_after_context_change"),
  });
}

function announceUpdate(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PILOT_METRICS_UPDATED_EVENT));
}

export function appendPilotWorkflowSnapshot(
  snapshot: Readonly<Record<string, number>>,
  options: {
    readonly capturedAtEpochMs?: number;
    readonly config?: PilotMetricsConfig;
    readonly storage?: Storage | null;
  } = {},
): boolean {
  const config = options.config ?? getPilotMetricsConfig();
  if (!config.enabled || config.releaseSha === null) return false;

  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const record = summarizePilotWorkflowSnapshot(
    snapshot,
    config.releaseSha,
    options.capturedAtEpochMs ?? Date.now(),
  );
  if (record === null || storage === null) return false;

  const current = readPilotMetricsPacket(config.releaseSha, storage);
  if (!current.ok) return false;
  const last = current.packet.records.at(-1);
  if (
    last !== undefined &&
    last.startedAtEpochMs === record.startedAtEpochMs &&
    last.endedAtEpochMs === record.endedAtEpochMs &&
    last.outcome === record.outcome
  ) {
    return true;
  }

  const packet: PilotMetricsPacket = {
    ...current.packet,
    records: [...current.packet.records, record].slice(-MAX_PILOT_METRIC_RECORDS),
  };
  try {
    storage.setItem(pilotMetricsStorageKey(config.releaseSha), JSON.stringify(packet));
  } catch {
    return false;
  }
  announceUpdate();
  return true;
}

export function createPilotMetricsExport(
  releaseSha: string,
  storage: Storage | null = browserStorage(),
  exportedAt: string = new Date().toISOString(),
): PilotMetricsExportResult {
  const current = readPilotMetricsPacket(releaseSha, storage);
  if (!current.ok) return current;
  return { ok: true, value: { ...current.packet, exportedAt } };
}

export function clearPilotMetrics(
  releaseSha: string,
  storage: Storage | null = browserStorage(),
): boolean {
  if (storage === null || !FULL_GIT_SHA.test(releaseSha)) return false;
  try {
    storage.removeItem(pilotMetricsStorageKey(releaseSha));
  } catch {
    return false;
  }
  announceUpdate();
  return true;
}
