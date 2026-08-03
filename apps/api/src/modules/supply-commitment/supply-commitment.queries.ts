import type { SupplyCommitmentGetInput, SupplyCommitmentListInput } from "@vuarau/domain-contracts";
import { err } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runQuery, toPage, toPageQuery } from "../shared/read-pipeline.ts";
import { toSupplyCommitmentDto } from "./supply-commitment.handlers.ts";

export function getSupplyCommitment(ctx: CommandContext, input: SupplyCommitmentGetInput) {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "supply_commitment.read",
    execute: async ({ repos }) => {
      const commitment = await repos.supplyCommitmentReads.get(
        input.workspaceId,
        input.supplyCommitmentId,
      );
      return commitment === null ? null : toSupplyCommitmentDto(commitment);
    },
  }).then((result) =>
    result.ok && result.value === null
      ? err("SUPPLY_COMMITMENT_NOT_FOUND", "No such Supply Commitment.")
      : result,
  );
}

export function listSupplyCommitments(ctx: CommandContext, input: SupplyCommitmentListInput) {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "supply_commitment.read",
    execute: async ({ repos }) =>
      toPage(
        await repos.supplyCommitmentReads.list({
          workspaceId: input.workspaceId,
          supplierId: input.supplierId,
          status: input.status,
          page: toPageQuery(input),
        }),
        toSupplyCommitmentDto,
      ),
  });
}
