import type { ExtensionCapability, ExtensionExecutionMode } from "@vuarau/domain-contracts";
import { CORE_EXTENSION_BOUNDARY } from "@vuarau/domain-contracts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";

/**
 * Guard the seam future adapters must cross. The core can accept a proposal or
 * route an extension through an existing canonical command, but it never lets
 * an extension write money, goods, ledger, policy or projections directly.
 */
export function decideExtensionExecution(input: {
  capability: ExtensionCapability;
  executionMode: ExtensionExecutionMode | "direct_core_effect";
}): DomainResult<{
  capability: ExtensionCapability;
  executionMode: ExtensionExecutionMode;
  directCoreEffects: false;
}> {
  if (!CORE_EXTENSION_BOUNDARY.includes(input.capability)) {
    return err("COMMAND_NOT_AVAILABLE", "The extension capability is not reserved by core.");
  }
  if (input.executionMode === "direct_core_effect") {
    return err(
      "COMMAND_NOT_AVAILABLE",
      "Extensions must use proposal-only output or a canonical core command.",
    );
  }
  return ok({
    capability: input.capability,
    executionMode: input.executionMode,
    directCoreEffects: false,
  });
}
