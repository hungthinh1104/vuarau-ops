import { api } from "./api.ts";
import { uniqueCustomerName } from "./environment.ts";

export type PostedSaleScenario = {
  readonly customerId: string;
  readonly saleId: string;
  readonly productId: string;
  readonly productName: string;
  readonly quantityScaled: number;
};

/**
 * Bounded setup for tests that start after a posted sale. It intentionally does
 * not hide browser actions or delivery commands; those remain the behavior under
 * test. The builder owns only repetitive, canonical API setup.
 */
export async function createPostedSaleScenario(input: {
  readonly label: string;
  readonly productId: string;
  readonly productName: string;
  readonly quantityScaled: number;
  readonly qualityGradeId?: string | null;
}): Promise<PostedSaleScenario> {
  const customerId = await api.createCustomer(uniqueCustomerName(input.label));
  const sale = await api.createPostedSale({
    customerId,
    productId: input.productId,
    productName: input.productName,
    quantityScaled: input.quantityScaled,
    ...(input.qualityGradeId === undefined ? {} : { qualityGradeId: input.qualityGradeId }),
  });
  return { ...input, customerId, saleId: sale.saleId };
}
