import type { CreateCustomerCommand, IsoInstant } from "@vuarau/domain-contracts";
import type { Decision } from "../shared/effects.ts";
import type { CustomerState } from "../shared/state.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";

export type CreateCustomerInput = {
  readonly command: CreateCustomerCommand;
  readonly recordedAt: IsoInstant;
};

/**
 * T-CUST-001 — master data, not a financial record.
 *
 * No ledger entry is produced. A new customer's debt is zero because they have no
 * entries, not because a zero was stored anywhere (ADR-0004).
 *
 * The blank-name check duplicates what the Zod schema already enforces, on
 * purpose: the kernel must be correct when called directly — by a test, an
 * importer, or a future caller that skipped the schema.
 */
export function decideCreateCustomer({
  command,
  recordedAt,
}: CreateCustomerInput): DomainResult<Decision<CustomerState>> {
  const { payload } = command;
  const displayName = payload.displayName.trim();

  if (displayName.length === 0) {
    return err("CUSTOMER_NAME_REQUIRED", "A customer needs a name you can find them by.", {
      customerId: payload.customerId,
    });
  }

  const customer: CustomerState = {
    id: payload.customerId,
    workspaceId: command.workspaceId,
    displayName,
    phone: payload.phone,
    note: payload.note,
    isActive: true,
    version: 1,
    transactionTime: command.occurredAt,
    recordedAt,
    updatedAt: recordedAt,
  };

  return ok({
    aggregate: customer,
    accountEntries: [],
    audit: {
      aggregateType: "customer",
      aggregateId: customer.id,
      action: "customer.created",
      transactionTime: command.occurredAt,
      recordedAt,
      before: null,
      after: { displayName: customer.displayName, hasPhone: customer.phone !== null },
      reason: null,
    },
  });
}
