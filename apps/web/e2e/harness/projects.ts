/**
 * Desktop deliberately covers the workflows where a second viewport gives
 * product evidence: money, goods, delivery and shell navigation. Mobile runs
 * the complete acceptance matrix; this list prevents read-only/admin specs
 * from doubling the browser cost without adding a second business assertion.
 */
export const DESKTOP_GOLDEN_SPECS = [
  "**/payment.spec.ts",
  "**/quick-sale.spec.ts",
  "**/goods-flow.spec.ts",
  "**/depot-operations.spec.ts",
  "**/workflow-hardening.spec.ts",
  "**/ui-shell.spec.ts",
] as const;
