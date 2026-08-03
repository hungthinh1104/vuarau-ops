import {
  priceRuleListInputSchema,
  recordPriceRuleCommandSchema,
  resolvePriceInputSchema,
} from "@vuarau/domain-contracts";
import { recordPriceRule } from "../../../modules/pricing/pricing.handlers.ts";
import { listPriceRules, resolvePrice } from "../../../modules/pricing/pricing.queries.ts";
import { authenticatedProcedure, commandProcedure, router, unwrap } from "../trpc.ts";

export const pricingRouter = router({
  record: commandProcedure
    .input(recordPriceRuleCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await recordPriceRule(ctx, input))),
  list: authenticatedProcedure
    .input(priceRuleListInputSchema)
    .query(async ({ ctx, input }) => unwrap(await listPriceRules(ctx, input))),
  resolve: authenticatedProcedure
    .input(resolvePriceInputSchema)
    .query(async ({ ctx, input }) => unwrap(await resolvePrice(ctx, input))),
});
