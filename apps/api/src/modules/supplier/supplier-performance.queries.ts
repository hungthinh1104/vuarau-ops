import type { SupplierPerformanceDto, SupplierPerformanceInput } from "@vuarau/domain-contracts";
import { supplierEvaluationPolicyDefinitionSchema } from "@vuarau/domain-contracts";
import {
  calculateSupplierPerformance,
  err,
  ok,
  resolvePolicyAsKnownAt,
} from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runQuery } from "../shared/read-pipeline.ts";

function unavailable(
  input: SupplierPerformanceInput,
  policyVersionId: SupplierPerformanceDto["policyVersionId"],
  policyVersion: SupplierPerformanceDto["policyVersion"],
  diagnostics: readonly string[],
): SupplierPerformanceDto {
  return {
    workspaceId: input.workspaceId,
    supplierId: input.supplierId,
    asOf: input.asOf,
    windowStart: input.asOf,
    status: "unavailable",
    policyVersionId,
    policyVersion,
    strategy: null,
    calculationVersion: "supplier-performance-v1",
    diagnostics: [...diagnostics],
    observationCount: 0,
    measurementObservationCount: 0,
    sourceObservationIds: [],
    quantityMetrics: [],
    timing: null,
  };
}

export async function getSupplierPerformance(ctx: CommandContext, input: SupplierPerformanceInput) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "supplier.read",
    execute: async ({ repos }) => {
      const calculatedAt = ctx.deps.clock.now();
      const supplier = await repos.suppliers.findById(input.workspaceId, input.supplierId);
      if (supplier === null) return null;

      const policy = resolvePolicyAsKnownAt(
        await repos.workspacePolicyReads.listAll(input.workspaceId),
        "supplier_evaluation",
        input.asOf,
        calculatedAt,
      );
      if (policy === null) {
        return unavailable(input, null, null, ["no_effective_supplier_evaluation_policy"]);
      }
      const definition = supplierEvaluationPolicyDefinitionSchema.safeParse(policy.definition);
      if (!definition.success) {
        return unavailable(input, policy.id, policy.version, [
          "invalid_supplier_evaluation_policy",
        ]);
      }
      return calculateSupplierPerformance({
        workspaceId: input.workspaceId,
        supplierId: input.supplierId,
        asOf: input.asOf,
        policy: definition.data,
        policyVersionId: policy.id,
        policyVersion: policy.version,
        observations: await repos.supplierObservationReads.listAll(input.workspaceId),
      });
    },
  });
  if (!result.ok) return result;
  return result.value === null ? err("SUPPLIER_NOT_FOUND", "No such supplier.") : ok(result.value);
}
