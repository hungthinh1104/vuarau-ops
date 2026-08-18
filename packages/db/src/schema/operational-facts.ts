import { boolean, pgView, uuid } from "drizzle-orm/pg-core";
import { unitEnum } from "./enums.ts";
import { safeBigint as bigint } from "./safe-bigint.ts";

/** Canonical physical fulfilment facts; time-dependent UI state is derived later. */
export const saleLineFulfilmentFactsV1 = pgView("sale_line_fulfilment_facts_v1", {
  workspaceId: uuid("workspace_id").notNull(),
  saleId: uuid("sale_id").notNull(),
  saleLineId: uuid("sale_line_id").notNull(),
  productId: uuid("product_id"),
  unit: unitEnum("unit").notNull(),
  orderedQuantityScaled: bigint("ordered_quantity_scaled", { mode: "number" }).notNull(),
  dispatchedQuantityScaled: bigint("dispatched_quantity_scaled", { mode: "number" }).notNull(),
  returnedQuantityScaled: bigint("returned_quantity_scaled", { mode: "number" }).notNull(),
  netFulfilledQuantityScaled: bigint("net_fulfilled_quantity_scaled", {
    mode: "number",
  }).notNull(),
  activeDispatchedRemainingQuantityScaled: bigint("active_dispatched_remaining_quantity_scaled", {
    mode: "number",
  }).notNull(),
  remainingQuantityScaled: bigint("remaining_quantity_scaled", { mode: "number" }).notNull(),
  integrity: boolean("integrity").notNull(),
}).existing();

/** Canonical inbound goods facts; acceptance and receipt reversals stay visible in the formula. */
export const purchaseLineReceivingFactsV1 = pgView("purchase_line_receiving_facts_v1", {
  workspaceId: uuid("workspace_id").notNull(),
  purchaseId: uuid("purchase_id").notNull(),
  purchaseLineId: uuid("purchase_line_id").notNull(),
  productId: uuid("product_id").notNull(),
  unit: unitEnum("unit").notNull(),
  orderedQuantityScaled: bigint("ordered_quantity_scaled", { mode: "number" }).notNull(),
  directReceivedNetQuantityScaled: bigint("direct_received_net_quantity_scaled", {
    mode: "number",
  }).notNull(),
  inspectedAcceptedNetQuantityScaled: bigint("inspected_accepted_net_quantity_scaled", {
    mode: "number",
  }).notNull(),
  receivedNetQuantityScaled: bigint("received_net_quantity_scaled", {
    mode: "number",
  }).notNull(),
  remainingQuantityScaled: bigint("remaining_quantity_scaled", { mode: "number" }).notNull(),
  integrity: boolean("integrity").notNull(),
}).existing();
