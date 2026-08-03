import type {
  CancelCustomerOrderCommand,
  ConfirmCustomerOrderCommand,
  CreateCustomerOrderDraftCommand,
  CustomerOrderLineInput,
  IsoInstant,
  UpdateCustomerOrderDraftCommand,
  CustomerOrderCapabilities,
} from "@vuarau/domain-contracts";
import { ALLOWED, denied } from "@vuarau/domain-contracts";
import { calculateLineTotal, isExactMoneyAmount } from "@vuarau/domain-contracts";
import type { CustomerOrderLineState, CustomerOrderState } from "../shared/state.ts";
import type { Decision } from "../shared/effects.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";
import { sumMoney } from "../shared/money.ts";

function validateChannelCustomer(command: {
  readonly channel: CustomerOrderState["channel"];
  readonly customerId: CustomerOrderState["customerId"];
}): DomainResult<null> {
  const customerRequired =
    command.channel === "account_customer" || command.channel === "contract_customer";
  if (customerRequired && command.customerId === null)
    return err(
      "CUSTOMER_ORDER_CUSTOMER_REQUIRED",
      "This Customer Order channel requires a customer.",
    );
  if (!customerRequired && command.customerId !== null)
    return err(
      "CUSTOMER_ORDER_CUSTOMER_NOT_ALLOWED",
      "This Customer Order channel must not use a customer record.",
    );
  return ok(null);
}

function validateLines(
  lines: readonly CustomerOrderLineInput[],
  currency: CustomerOrderState["currency"],
  requireConfirmationFields: boolean,
): DomainResult<readonly CustomerOrderLineState[]> {
  const result: CustomerOrderLineState[] = [];
  for (const [index, line] of lines.entries()) {
    if (
      line.productName.trim().length === 0 ||
      line.quantity.valueScaled <= 0 ||
      !Number.isInteger(line.quantity.valueScaled)
    )
      return err("CUSTOMER_ORDER_LINE_INVALID", `Customer Order line ${index} is invalid.`, {
        index,
      });
    if (line.agreedUnitPrice !== null) {
      if (line.agreedUnitPrice.currency !== currency)
        return err(
          "CUSTOMER_ORDER_CURRENCY_MISMATCH",
          `Customer Order line ${index} currency does not match.`,
        );
      if (
        line.agreedUnitPrice.amountMinor < 0 ||
        !Number.isInteger(line.agreedUnitPrice.amountMinor)
      )
        return err(
          "CUSTOMER_ORDER_LINE_INVALID",
          `Customer Order line ${index} price is invalid.`,
          { index },
        );
    }
    if (requireConfirmationFields && line.productId === null)
      return err(
        "CUSTOMER_ORDER_PRODUCT_REQUIRED",
        "Every confirmed order line needs a catalogue Product.",
        { index, lineId: line.lineId },
      );
    if (requireConfirmationFields && line.agreedUnitPrice === null)
      return err(
        "CUSTOMER_ORDER_PRICE_REQUIRED",
        "Every confirmed order line needs an agreed price.",
        { index, lineId: line.lineId },
      );
    const lineTotal =
      line.agreedUnitPrice === null
        ? null
        : calculateLineTotal(line.quantity, line.agreedUnitPrice);
    if (lineTotal !== null && !isExactMoneyAmount(lineTotal.amountMinor))
      return err(
        "CUSTOMER_ORDER_LINE_INVALID",
        `Customer Order line ${index} exceeds exact range.`,
        { index },
      );
    result.push({ ...line, productName: line.productName.trim(), lineTotal });
  }
  return ok(result);
}

function calculateTotal(
  lines: readonly CustomerOrderLineState[],
  currency: CustomerOrderState["currency"],
) {
  return lines.length === 0 || lines.some((line) => line.lineTotal === null)
    ? null
    : sumMoney(
        lines.map((line) => line.lineTotal!),
        currency,
      );
}

function guardVersion(current: CustomerOrderState, expectedVersion: number): DomainResult<null> {
  if (current.version !== expectedVersion)
    return err("CUSTOMER_ORDER_VERSION_CONFLICT", "Customer Order changed on the server.", {
      customerOrderId: current.id,
      expectedVersion,
      actualVersion: current.version,
    });
  return ok(null);
}

export function decideCreateCustomerOrderDraft(
  command: CreateCustomerOrderDraftCommand,
  recordedAt: IsoInstant,
): DomainResult<Decision<CustomerOrderState>> {
  const channel = validateChannelCustomer(command.payload);
  if (!channel.ok) return channel;
  const lines = validateLines(command.payload.lines, command.payload.currency, false);
  if (!lines.ok) return lines;
  const order: CustomerOrderState = {
    id: command.payload.customerOrderId,
    workspaceId: command.workspaceId,
    customerId: command.payload.customerId,
    channel: command.payload.channel,
    status: "draft",
    currency: command.payload.currency,
    lines: lines.value,
    totalAmount: calculateTotal(lines.value, command.payload.currency),
    note: command.payload.note?.trim() || null,
    paymentTermsSnapshot: command.payload.paymentTermsSnapshot,
    evidenceReferences: [...(command.payload.evidenceReferences ?? [])],
    version: 1,
    transactionTime: command.occurredAt,
    recordedAt,
    confirmedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    replacesCustomerOrderId: command.payload.replacesCustomerOrderId,
  };
  return ok({
    aggregate: order,
    accountEntries: [],
    audit: {
      aggregateType: "customer_order",
      aggregateId: order.id,
      action: "customer_order.draft_created",
      transactionTime: command.occurredAt,
      recordedAt,
      before: null,
      after: {
        status: order.status,
        lineCount: order.lines.length,
        totalMinor: order.totalAmount?.amountMinor ?? null,
      },
      reason: null,
    },
  });
}

export function decideUpdateCustomerOrderDraft(
  current: CustomerOrderState,
  command: UpdateCustomerOrderDraftCommand,
  recordedAt: IsoInstant,
): DomainResult<Decision<CustomerOrderState>> {
  const version = guardVersion(current, command.expectedVersion);
  if (!version.ok) return version;
  if (current.status === "confirmed")
    return err("CUSTOMER_ORDER_ALREADY_CONFIRMED", "A confirmed Customer Order is immutable.");
  if (current.status === "cancelled")
    return err("CUSTOMER_ORDER_ALREADY_CANCELLED", "A cancelled Customer Order cannot be edited.");
  const channel = validateChannelCustomer(command.payload);
  if (!channel.ok) return channel;
  const lines = validateLines(command.payload.lines, command.payload.currency, false);
  if (!lines.ok) return lines;
  const edited: CustomerOrderState = {
    ...current,
    customerId: command.payload.customerId,
    channel: command.payload.channel,
    currency: command.payload.currency,
    lines: lines.value,
    totalAmount: calculateTotal(lines.value, command.payload.currency),
    note: command.payload.note?.trim() || null,
    paymentTermsSnapshot: command.payload.paymentTermsSnapshot,
    evidenceReferences: [...(command.payload.evidenceReferences ?? [])],
    version: current.version + 1,
    recordedAt,
  };
  return ok({
    aggregate: edited,
    accountEntries: [],
    audit: {
      aggregateType: "customer_order",
      aggregateId: current.id,
      action: "customer_order.draft_edited",
      transactionTime: command.occurredAt,
      recordedAt,
      before: { version: current.version },
      after: { version: edited.version, lineCount: edited.lines.length },
      reason: null,
    },
  });
}

export function decideConfirmCustomerOrder(
  current: CustomerOrderState,
  command: ConfirmCustomerOrderCommand,
  recordedAt: IsoInstant,
): DomainResult<Decision<CustomerOrderState>> {
  const version = guardVersion(current, command.expectedVersion);
  if (!version.ok) return version;
  if (current.status === "confirmed")
    return err("CUSTOMER_ORDER_ALREADY_CONFIRMED", "Customer Order is already confirmed.");
  if (current.status === "cancelled")
    return err(
      "CUSTOMER_ORDER_ALREADY_CANCELLED",
      "A cancelled Customer Order cannot be confirmed.",
    );
  if (current.lines.length === 0)
    return err("CUSTOMER_ORDER_EMPTY", "A Customer Order needs at least one line.");
  const lines = validateLines(current.lines, current.currency, true);
  if (!lines.ok) return lines;
  const confirmed: CustomerOrderState = {
    ...current,
    status: "confirmed",
    lines: lines.value,
    totalAmount: calculateTotal(lines.value, current.currency),
    version: current.version + 1,
    confirmedAt: command.occurredAt,
  };
  return ok({
    aggregate: confirmed,
    accountEntries: [],
    audit: {
      aggregateType: "customer_order",
      aggregateId: current.id,
      action: "customer_order.confirmed",
      transactionTime: command.occurredAt,
      recordedAt,
      before: { status: current.status, version: current.version },
      after: {
        status: confirmed.status,
        version: confirmed.version,
        totalMinor: confirmed.totalAmount?.amountMinor ?? null,
      },
      reason: null,
    },
  });
}

export function decideCancelCustomerOrder(
  current: CustomerOrderState,
  command: CancelCustomerOrderCommand,
  recordedAt: IsoInstant,
): DomainResult<Decision<CustomerOrderState>> {
  const version = guardVersion(current, command.expectedVersion);
  if (!version.ok) return version;
  if (current.status === "cancelled")
    return err("CUSTOMER_ORDER_ALREADY_CANCELLED", "Customer Order is already cancelled.");
  const cancelled: CustomerOrderState = {
    ...current,
    status: "cancelled",
    version: current.version + 1,
    cancelledAt: command.occurredAt,
    cancellationReason: command.payload.reason.trim(),
  };
  return ok({
    aggregate: cancelled,
    accountEntries: [],
    audit: {
      aggregateType: "customer_order",
      aggregateId: current.id,
      action: "customer_order.cancelled",
      transactionTime: command.occurredAt,
      recordedAt,
      before: { status: current.status, version: current.version },
      after: { status: cancelled.status, version: cancelled.version },
      reason: cancelled.cancellationReason,
    },
  });
}

/** Rendering hints derived from order state; authorization is still checked by the API. */
export function customerOrderCapabilities(order: CustomerOrderState): CustomerOrderCapabilities {
  return {
    edit:
      order.status === "draft"
        ? ALLOWED
        : denied(
            order.status === "confirmed"
              ? "CUSTOMER_ORDER_ALREADY_CONFIRMED"
              : "CUSTOMER_ORDER_ALREADY_CANCELLED",
          ),
    confirm:
      order.status === "draft"
        ? ALLOWED
        : denied(
            order.status === "confirmed"
              ? "CUSTOMER_ORDER_ALREADY_CONFIRMED"
              : "CUSTOMER_ORDER_ALREADY_CANCELLED",
          ),
    cancel: order.status === "cancelled" ? denied("CUSTOMER_ORDER_ALREADY_CANCELLED") : ALLOWED,
  } satisfies CustomerOrderCapabilities;
}
