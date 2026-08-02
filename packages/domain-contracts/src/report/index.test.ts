import { describe, expect, it } from "vitest";
import {
  REPORT_DEFINITIONS,
  REPORT_DEFINITIONS_DTO,
  METRIC_AVAILABILITY_DEFINITIONS,
  REPORT_METRIC_DEFINITIONS_DTO,
  REPORT_TYPES,
  reportDefinitionSchema,
  reportDefinitionsDtoSchema,
  metricDefinitionSchema,
  reportMetricDefinitionsDtoSchema,
} from "./index.ts";

describe("operational report semantic definitions", () => {
  it("defines exactly one validated semantic entry for every operational report", () => {
    expect(REPORT_DEFINITIONS.map((definition) => definition.reportType)).toEqual(REPORT_TYPES);
    expect(new Set(REPORT_DEFINITIONS.map((definition) => definition.reportType)).size).toBe(
      REPORT_TYPES.length,
    );

    for (const definition of REPORT_DEFINITIONS) {
      const parsed = reportDefinitionSchema.safeParse(definition);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      expect(definition.filters).toHaveLength(3);
      expect(definition.action.kind).toBe("drilldown");
      expect(definition.action.label).not.toHaveLength(0);
    }
  });

  it("marks projection reports fail-closed and canonical reports source-visible", () => {
    const byType = new Map(
      REPORT_DEFINITIONS.map((definition) => [definition.reportType, definition]),
    );

    for (const reportType of [
      "customer_receivables",
      "supplier_payables",
      "inventory_by_product_unit",
      "cash_balances",
    ] as const) {
      const definition = byType.get(reportType)!;
      expect(definition.source.kind).toBe("projection");
      expect(definition.integrity).toEqual({ state: "projection", onAttention: "fail_closed" });
    }

    for (const reportType of [
      "customer_account_activity",
      "inventory_movement_report",
      "cash_movement_report",
      "expense_report",
    ] as const) {
      const definition = byType.get(reportType)!;
      expect(definition.integrity.onAttention).toBe("show_with_attention");
    }
  });

  it("publishes a versioned DTO without introducing policy-blocked metrics", () => {
    const parsed = reportDefinitionsDtoSchema.safeParse(REPORT_DEFINITIONS_DTO);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(REPORT_DEFINITIONS_DTO.version).toBe(1);
    expect(REPORT_DEFINITIONS_DTO.definitions.map((definition) => definition.reportType)).toEqual(
      REPORT_TYPES,
    );
  });

  it("publishes policy-blocked metric availability without numeric fallbacks", () => {
    const parsed = reportMetricDefinitionsDtoSchema.safeParse(REPORT_METRIC_DEFINITIONS_DTO);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(REPORT_METRIC_DEFINITIONS_DTO.version).toBe(1);
    expect(
      METRIC_AVAILABILITY_DEFINITIONS.every((metric) => metric.availability === "unavailable"),
    ).toBe(true);
    expect(METRIC_AVAILABILITY_DEFINITIONS.every((metric) => metric.blockedBy.length > 0)).toBe(
      true,
    );
  });

  it("requires the complete semantic contract before a metric can be available", () => {
    const incomplete = metricDefinitionSchema.safeParse({
      metricId: "cogs",
      label: "COGS",
      availability: "available",
    });
    expect(incomplete.success).toBe(false);

    const complete = metricDefinitionSchema.safeParse({
      metricId: "cogs",
      label: "COGS",
      availability: "available",
      formula: "field-approved formula",
      canonicalSources: ["field-approved canonical source"],
      includedStates: ["field-approved included state"],
      excludedStates: ["field-approved excluded state"],
      businessTime: "field-approved business-time semantics",
      scope: "field-approved scope and filters",
      freshness: "field-approved freshness contract",
      integrity: "projection",
      onIntegrityAttention: "fail_closed",
      drilldown: "field-approved drill-down destination",
      action: "field-approved action",
    });
    expect(complete.success, JSON.stringify(complete.error?.issues)).toBe(true);
  });
});
