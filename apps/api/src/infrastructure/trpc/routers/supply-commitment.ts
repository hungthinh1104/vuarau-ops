import {
  cancelSupplyCommitmentCommandSchema,
  confirmSupplyCommitmentCommandSchema,
  createSupplyCommitmentDraftCommandSchema,
  supplyCommitmentGetInputSchema,
  supplyCommitmentListInputSchema,
  updateSupplyCommitmentDraftCommandSchema,
} from "@vuarau/domain-contracts";
import { authenticatedProcedure, commandProcedure, router, unwrap } from "../trpc.ts";
import {
  cancelSupplyCommitment,
  confirmSupplyCommitment,
  createSupplyCommitmentDraft,
  updateSupplyCommitmentDraft,
} from "../../../modules/supply-commitment/supply-commitment.handlers.ts";
import {
  getSupplyCommitment,
  listSupplyCommitments,
} from "../../../modules/supply-commitment/supply-commitment.queries.ts";

export const supplyCommitmentRouter = router({
  createDraft: commandProcedure
    .input(createSupplyCommitmentDraftCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await createSupplyCommitmentDraft(ctx, input))),
  updateDraft: commandProcedure
    .input(updateSupplyCommitmentDraftCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await updateSupplyCommitmentDraft(ctx, input))),
  confirm: commandProcedure
    .input(confirmSupplyCommitmentCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await confirmSupplyCommitment(ctx, input))),
  cancel: commandProcedure
    .input(cancelSupplyCommitmentCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await cancelSupplyCommitment(ctx, input))),
  get: authenticatedProcedure
    .input(supplyCommitmentGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getSupplyCommitment(ctx, input))),
  list: authenticatedProcedure
    .input(supplyCommitmentListInputSchema)
    .query(async ({ ctx, input }) => unwrap(await listSupplyCommitments(ctx, input))),
});
