import type {
  ManagementIntelligencePolicyDefinition,
  OperationalReportDto,
  WorkspaceId,
  WorkspacePolicyVersionId,
} from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import { calculateManagementIntelligence } from "./index.ts";

const workspaceId = "00000000-0000-0000-0000-000000000001" as WorkspaceId;
const policyVersionId = "00000000-0000-0000-0000-000000000002" as WorkspacePolicyVersionId;

const policy: ManagementIntelligencePolicyDefinition = {
  contractVersion: 1,
  parameters: {
    strategy: "operational_report_snapshot",
    reportTypes: ["cash_balances", "inventory_by_product_unit"],
  },
};

function report(
  reportType: OperationalReportDto["reportType"],
  overrides: Partial<OperationalReportDto> = {},
): OperationalReportDto {
  return {
    reportType,
    businessDate: "2026-08-04",
    timezone: "Asia/Ho_Chi_Minh",
    integrity: "healthy",
    diagnostics: [],
    totals: { amount: null, quantities: [] },
    page: { items: [], nextCursor: null },
    ...overrides,
  };
}

function calculate(
  snapshots: readonly {
    reportType: OperationalReportDto["reportType"];
    report: OperationalReportDto;
  }[],
) {
  return calculateManagementIntelligence({
    workspaceId,
    asOf: "2026-08-04T09:00:00.000Z",
    businessDate: "2026-08-04",
    policy,
    policyVersionId,
    policyVersion: 3,
    snapshots,
  });
}

describe("management intelligence", () => {
  it("copies selected operational totals with policy and source lineage", () => {
    const result = calculate([
      {
        reportType: "inventory_by_product_unit",
        report: report("inventory_by_product_unit", {
          totals: { amount: null, quantities: [{ unit: "kg", valueScaled: 125_000 }] },
        }),
      },
      {
        reportType: "cash_balances",
        report: report("cash_balances", {
          totals: { amount: { amountMinor: 2_500_000, currency: "VND" }, quantities: [] },
        }),
      },
    ]);

    expect(result).toMatchObject({
      status: "available",
      policyVersionId,
      policyVersion: 3,
      sourceReportTypes: ["cash_balances", "inventory_by_product_unit"],
      indicators: [
        {
          reportType: "cash_balances",
          sourceReportType: "cash_balances",
          totals: { amount: { amountMinor: 2_500_000, currency: "VND" } },
        },
        {
          reportType: "inventory_by_product_unit",
          sourceReportType: "inventory_by_product_unit",
          totals: { quantities: [{ unit: "kg", valueScaled: 125_000 }] },
        },
      ],
    });
  });

  it("fails closed when any selected source report needs attention", () => {
    const result = calculate([
      {
        reportType: "cash_balances",
        report: report("cash_balances", {
          integrity: "attention",
          diagnostics: ["report_projection_unavailable"],
        }),
      },
      {
        reportType: "inventory_by_product_unit",
        report: report("inventory_by_product_unit"),
      },
    ]);

    expect(result).toMatchObject({
      status: "unavailable",
      diagnostics: ["management_source_integrity_attention"],
      indicators: [],
      sourceReportTypes: ["cash_balances", "inventory_by_product_unit"],
    });
  });
});
