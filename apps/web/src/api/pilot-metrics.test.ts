import { beforeEach, describe, expect, it } from "vitest";
import {
  appendPilotWorkflowSnapshot,
  createPilotMetricsExport,
  pilotMetricsConfigFromValues,
  pilotMetricsPacketSchema,
  pilotMetricsStorageKey,
  readPilotMetricsPacket,
  summarizePilotWorkflowSnapshot,
} from "./pilot-metrics.ts";

const RELEASE_A = "a".repeat(40);
const RELEASE_B = "b".repeat(40);

beforeEach(() => {
  localStorage.clear();
});

describe("TC-WEB-031 — on-device pilot workflow metrics", () => {
  it("fails closed when capture is requested without an exact release SHA", () => {
    expect(pilotMetricsConfigFromValues("1", undefined)).toEqual({
      requested: true,
      enabled: false,
      releaseSha: null,
      problem: "NEXT_PUBLIC_RELEASE_SHA must be the full 40-character Git commit SHA.",
    });
    expect(pilotMetricsConfigFromValues("1", "abc123").enabled).toBe(false);
    expect(pilotMetricsConfigFromValues(undefined, RELEASE_A).requested).toBe(false);
  });

  it("summarizes only the closed numeric workflow vocabulary", () => {
    const record = summarizePilotWorkflowSnapshot(
      {
        draft_started_at: 1_000,
        post_attempted_at: 2_500,
        post_confirmed_at: 3_000,
        sale_line_count: 3,
        validation_error_count: 2,
        line_edit_count: 4,
        customer_created_inline: 1,
        historical_price_offered: 1,
        historical_price_applied: 1,
      },
      RELEASE_A,
      3_000,
    );

    expect(record).toEqual(
      expect.objectContaining({
        releaseSha: RELEASE_A,
        outcome: "posted",
        durationMs: 2_000,
        postAttemptLatencyMs: 500,
        saleLineCount: 3,
        validationErrorCount: 2,
        lineEditCount: 4,
        customerCreatedInline: 1,
        historicalPriceOffered: 1,
        historicalPriceApplied: 1,
      }),
    );
    expect(record).not.toHaveProperty("customerId");
    expect(record).not.toHaveProperty("productId");
    expect(record).not.toHaveProperty("amount");
    expect(record).not.toHaveProperty("note");
  });

  it("persists a completed workflow locally and binds it to one release", () => {
    const config = pilotMetricsConfigFromValues("1", RELEASE_A);
    expect(
      appendPilotWorkflowSnapshot(
        {
          draft_started_at: 10_000,
          post_attempted_at: 11_000,
          post_confirmed_at: 12_000,
          sale_line_count: 1,
          unknown_outcome_count: 1,
          command_retry_count: 1,
        },
        { config, storage: localStorage, capturedAtEpochMs: 12_000 },
      ),
    ).toBe(true);

    const read = readPilotMetricsPacket(RELEASE_A, localStorage);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.packet.releaseSha).toBe(RELEASE_A);
    expect(read.packet.records).toHaveLength(1);
    expect(read.packet.records[0]).toEqual(
      expect.objectContaining({
        outcome: "posted",
        durationMs: 2_000,
        unknownOutcomeCount: 1,
        commandRetryCount: 1,
      }),
    );
    expect(readPilotMetricsPacket(RELEASE_B, localStorage)).toEqual(
      expect.objectContaining({ ok: true }),
    );
    const otherRelease = readPilotMetricsPacket(RELEASE_B, localStorage);
    if (otherRelease.ok) expect(otherRelease.packet.records).toHaveLength(0);
  });

  it("records an explicit abandonment without inventing a post time", () => {
    const record = summarizePilotWorkflowSnapshot(
      { draft_started_at: 20_000, workflow_abandoned: 1, line_edit_count: 2 },
      RELEASE_A,
      25_000,
    );
    expect(record).toEqual(
      expect.objectContaining({
        outcome: "abandoned",
        startedAtEpochMs: 20_000,
        endedAtEpochMs: 25_000,
        durationMs: 5_000,
        postAttemptLatencyMs: null,
        lineEditCount: 2,
      }),
    );
  });

  it("does not overwrite malformed stored evidence", () => {
    localStorage.setItem(pilotMetricsStorageKey(RELEASE_A), "{not-json");
    const before = localStorage.getItem(pilotMetricsStorageKey(RELEASE_A));
    const config = pilotMetricsConfigFromValues("1", RELEASE_A);

    expect(
      appendPilotWorkflowSnapshot(
        { draft_started_at: 1_000, post_confirmed_at: 2_000 },
        { config, storage: localStorage, capturedAtEpochMs: 2_000 },
      ),
    ).toBe(false);
    expect(localStorage.getItem(pilotMetricsStorageKey(RELEASE_A))).toBe(before);
  });

  it("exports a strict packet and rejects fields that could smuggle business data", () => {
    const config = pilotMetricsConfigFromValues("1", RELEASE_A);
    appendPilotWorkflowSnapshot(
      { draft_started_at: 1_000, post_confirmed_at: 2_000, sale_line_count: 1 },
      { config, storage: localStorage, capturedAtEpochMs: 2_000 },
    );

    const exported = createPilotMetricsExport(RELEASE_A, localStorage, "2026-08-23T00:00:00.000Z");
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    expect(exported.value.exportedAt).toBe("2026-08-23T00:00:00.000Z");

    const packet = readPilotMetricsPacket(RELEASE_A, localStorage);
    expect(packet.ok).toBe(true);
    if (!packet.ok) return;
    expect(
      pilotMetricsPacketSchema.safeParse({
        ...packet.packet,
        records: [{ ...packet.packet.records[0], customerName: "Khách A" }],
      }).success,
    ).toBe(false);
  });
});
