import {
  createProductCommandSchema,
  updateProductCommandSchema,
  deactivateProductCommandSchema,
  reactivateProductCommandSchema,
  productSearchInputSchema,
  productGetInputSchema,
} from "@vuarau/domain-contracts";
import { authenticatedProcedure, commandProcedure, router, unwrap } from "../trpc.ts";
import {
  createProduct,
  deactivateProduct,
  reactivateProduct,
  updateProduct,
} from "../../../modules/product/product.handlers.ts";
import { getProduct, searchProducts } from "../../../modules/product/product.queries.ts";

export const productRouter = router({
  create: commandProcedure
    .input(createProductCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await createProduct(ctx, input))),
  update: commandProcedure
    .input(updateProductCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await updateProduct(ctx, input))),
  deactivate: commandProcedure
    .input(deactivateProductCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await deactivateProduct(ctx, input))),
  reactivate: commandProcedure
    .input(reactivateProductCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reactivateProduct(ctx, input))),
  search: authenticatedProcedure
    .input(productSearchInputSchema)
    .query(async ({ ctx, input }) => unwrap(await searchProducts(ctx, input))),
  get: authenticatedProcedure
    .input(productGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getProduct(ctx, input))),
});
