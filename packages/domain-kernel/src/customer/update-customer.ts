import type {
  DeactivateCustomerCommand,
  IsoInstant,
  UpdateCustomerCommand,
} from "@vuarau/domain-contracts";
import type { Decision } from "../shared/effects.ts";
import type { CustomerState } from "../shared/state.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";

export type UpdateCustomerInput = {
  readonly command: UpdateCustomerCommand;
  readonly customer: CustomerState;
  readonly recordedAt: IsoInstant;
};

/**
 * T-CUST-002 — correcting master data.
 *
 * `accountEntries` is empty and always will be (BR-ACCOUNT-002): renaming
 * somebody must never move what they owe. That is the whole reason a *named*
 * command exists instead of a patch — a generic `updateEntity` would eventually
 * be handed a field that does move money.
 */
export function decideUpdateCustomer({
  command,
  customer,
  recordedAt,
}: UpdateCustomerInput): DomainResult<Decision<CustomerState>> {
  if (command.expectedVersion !== customer.version) {
    return err(
      "CUSTOMER_VERSION_CONFLICT",
      `Customer was modified by someone else: expected version ${command.expectedVersion}, found ${customer.version}.`,
      {
        customerId: customer.id,
        expectedVersion: command.expectedVersion,
        actualVersion: customer.version,
      },
    );
  }

  const displayName = command.payload.displayName.trim();
  if (displayName.length === 0) {
    return err("CUSTOMER_NAME_REQUIRED", "A customer needs a name.", { customerId: customer.id });
  }

  const updated: CustomerState = {
    ...customer,
    displayName,
    phone: command.payload.phone,
    note: command.payload.note,
    version: customer.version + 1,
    updatedAt: recordedAt,
  };

  return ok({
    aggregate: updated,
    accountEntries: [],
    audit: {
      aggregateType: "customer",
      aggregateId: customer.id,
      action: "customer.updated",
      transactionTime: command.occurredAt,
      recordedAt,
      // Only the fields that changed. A dump of the aggregate would copy customer
      // data into a table with a different retention policy.
      before: changedFields(customer, updated),
      after: changedFields(updated, customer),
      reason: null,
    },
  });
}

function changedFields(from: CustomerState, to: CustomerState): Record<string, unknown> | null {
  const changes: Record<string, unknown> = {};
  if (from.displayName !== to.displayName) changes["displayName"] = from.displayName;
  if (from.phone !== to.phone) changes["phone"] = from.phone;
  if (from.note !== to.note) changes["note"] = from.note;
  return Object.keys(changes).length === 0 ? null : changes;
}

export type DeactivateCustomerInput = {
  readonly command: DeactivateCustomerCommand;
  readonly customer: CustomerState;
  readonly recordedAt: IsoInstant;
};

/**
 * T-CUST-003 — hiding a customer from new sales.
 *
 * **Their balance is untouched** (BR-CUSTOMER-003). A deactivated customer who
 * owes money still owes it, still appears in the account book, and still shows up
 * when somebody chases old balances.
 *
 * Anything else would make "tidy up the customer list" a way to make debt vanish,
 * which is precisely the operation a system built to keep debt records
 * trustworthy must not offer. `accountEntries` being empty here is that rule.
 */
export function decideDeactivateCustomer({
  command,
  customer,
  recordedAt,
}: DeactivateCustomerInput): DomainResult<Decision<CustomerState>> {
  if (command.expectedVersion !== customer.version) {
    return err(
      "CUSTOMER_VERSION_CONFLICT",
      `Customer was modified by someone else: expected version ${command.expectedVersion}, found ${customer.version}.`,
      {
        customerId: customer.id,
        expectedVersion: command.expectedVersion,
        actualVersion: customer.version,
      },
    );
  }

  if (!customer.isActive) {
    return err("CUSTOMER_ALREADY_INACTIVE", "This customer is already deactivated.", {
      customerId: customer.id,
    });
  }

  const deactivated: CustomerState = {
    ...customer,
    isActive: false,
    version: customer.version + 1,
    updatedAt: recordedAt,
  };

  return ok({
    aggregate: deactivated,
    accountEntries: [],
    audit: {
      aggregateType: "customer",
      aggregateId: customer.id,
      action: "customer.deactivated",
      transactionTime: command.occurredAt,
      recordedAt,
      before: { isActive: true },
      after: { isActive: false },
      reason: command.payload.reason,
    },
  });
}
