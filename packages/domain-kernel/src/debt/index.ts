import type {
  DebtAgingPaymentRow,
  DebtAgingSaleRow,
  DebtAgingState,
  PaymentAllocationStrategy,
  PaymentTermSource,
  PaymentTermsAgingPolicyDefinition,
  WorkspacePolicyVersionId,
} from "@vuarau/domain-contracts";
import type {
  CurrencyCode,
  CustomerId,
  IsoInstant,
  Money,
  PaymentAllocationId,
  PaymentAllocationReversalId,
  PaymentId,
  SaleId,
} from "@vuarau/domain-contracts";

export type DebtAgingSaleSource = {
  readonly saleId: SaleId;
  readonly customerId: CustomerId;
  readonly amount: Money;
  readonly transactionTime: IsoInstant;
  readonly dueAt: IsoInstant | null;
  readonly paymentTermsPolicyVersionId?: WorkspacePolicyVersionId | null;
  readonly paymentTermsSource?: PaymentTermSource | null;
};

export type DebtAgingPaymentSource = {
  readonly paymentId: PaymentId;
  readonly customerId: CustomerId;
  readonly amount: Money;
  readonly reversals: readonly { readonly amount: Money; readonly transactionTime: IsoInstant }[];
  readonly transactionTime: IsoInstant;
};

export type DebtAgingLedgerSource = {
  readonly entryId: string;
  readonly sourceType:
    "sale_posting" | "sale_void" | "payment" | "payment_reversal" | "manual_adjustment";
  readonly sourceId: string;
  readonly customerId: CustomerId;
  readonly amount: Money;
  readonly transactionTime: IsoInstant;
};

export type DebtAgingAllocationSource = {
  readonly allocationId: PaymentAllocationId;
  readonly customerId: CustomerId;
  readonly paymentId: PaymentId;
  readonly saleId: SaleId;
  readonly amount: Money;
  readonly transactionTime: IsoInstant;
};

export type DebtAgingAllocationReversalSource = {
  readonly reversalId: PaymentAllocationReversalId;
  readonly allocationId: PaymentAllocationId;
  readonly customerId: CustomerId;
  readonly amount: Money;
  readonly transactionTime: IsoInstant;
};

export type DebtAgingSources = {
  readonly sales: readonly DebtAgingSaleSource[];
  readonly payments: readonly DebtAgingPaymentSource[];
  readonly ledgerEntries: readonly DebtAgingLedgerSource[];
  readonly allocations: readonly DebtAgingAllocationSource[];
  readonly allocationReversals: readonly DebtAgingAllocationReversalSource[];
};

export type DebtAgingCalculation = {
  readonly rows: readonly DebtAgingSaleRow[];
  readonly payments: readonly DebtAgingPaymentRow[];
  readonly totals: {
    readonly ledgerBalance: Money;
    readonly saleOutstanding: Money;
    readonly overdue: Money;
    readonly due: Money;
    readonly notDue: Money;
    readonly disputed: Money;
    readonly customerCredit: Money;
    readonly unallocatedPayment: Money;
  };
  readonly diagnostics: readonly string[];
};

export * from "./credit-limit.ts";

type TermSource = "sale_override" | "customer_policy" | "workspace_policy" | "none";

export type ResolvedPaymentTerm = {
  readonly label: string;
  readonly termDays: number;
  readonly source: Exclude<TermSource, "sale_override" | "none">;
  readonly policyVersionId: WorkspacePolicyVersionId;
};

export function resolvePaymentTerm(
  definition: PaymentTermsAgingPolicyDefinition,
  customerId: CustomerId,
  policyVersionId: WorkspacePolicyVersionId,
): ResolvedPaymentTerm | null {
  const override = definition.parameters.customerTerms.find(
    (term) => term.customerId === customerId,
  );
  if (override !== undefined) {
    return {
      label: override.label,
      termDays: override.termDays,
      source: "customer_policy",
      policyVersionId,
    };
  }
  if (definition.parameters.defaultTermDays === null) return null;
  return {
    label: definition.parameters.defaultTermLabel,
    termDays: definition.parameters.defaultTermDays,
    source: "workspace_policy",
    policyVersionId,
  };
}

export function addPaymentTermDays(transactionTime: IsoInstant, termDays: number): IsoInstant {
  const date = new Date(transactionTime);
  date.setUTCDate(date.getUTCDate() + termDays);
  return date.toISOString() as IsoInstant;
}

function sumMoney(values: readonly Money[], currency: CurrencyCode): Money {
  return {
    amountMinor: values.reduce((total, value) => total + value.amountMinor, 0),
    currency,
  };
}

function subtractMoney(left: Money, right: Money): Money {
  return { amountMinor: left.amountMinor - right.amountMinor, currency: left.currency };
}

function positiveMoney(amountMinor: number, currency: CurrencyCode): Money {
  return { amountMinor: Math.max(0, amountMinor), currency };
}

function daysOverdue(dueAt: IsoInstant | null, asOf: IsoInstant, graceDays: number): number {
  if (dueAt === null || Date.parse(dueAt) > Date.parse(asOf)) return 0;
  const elapsed = Math.floor((Date.parse(asOf) - Date.parse(dueAt)) / 86_400_000);
  return Math.max(0, elapsed - graceDays);
}

function stateFor(dueAt: IsoInstant | null, asOf: IsoInstant, graceDays: number): DebtAgingState {
  if (dueAt === null) return "no_term";
  if (Date.parse(dueAt) > Date.parse(asOf)) return "not_due";
  if (daysOverdue(dueAt, asOf, graceDays) > 0) return "overdue";
  return "due";
}

function bucketFor(daysLate: number, definition: PaymentTermsAgingPolicyDefinition): string | null {
  if (daysLate === 0) return null;
  return (
    definition.parameters.agingBuckets.find(
      (bucket) =>
        daysLate >= bucket.minDaysOverdue &&
        (bucket.maxDaysOverdue === null || daysLate <= bucket.maxDaysOverdue),
    )?.code ?? null
  );
}

export function calculateDebtAging(
  sources: DebtAgingSources,
  terms: PaymentTermsAgingPolicyDefinition,
  allocationStrategy: PaymentAllocationStrategy,
  asOf: IsoInstant,
): DebtAgingCalculation {
  const diagnostics = new Set<string>();
  const sales = [...sources.sales].sort((left, right) =>
    left.transactionTime === right.transactionTime
      ? left.saleId.localeCompare(right.saleId)
      : left.transactionTime.localeCompare(right.transactionTime),
  );
  const payments = [...sources.payments]
    .map((payment) => {
      const reversed = payment.reversals
        .filter((reversal) => reversal.transactionTime <= asOf)
        .reduce((total, reversal) => total + reversal.amount.amountMinor, 0);
      return {
        ...payment,
        effectiveAmount: Math.max(0, payment.amount.amountMinor - reversed),
        reversedAmount: reversed,
      };
    })
    .sort((left, right) =>
      left.transactionTime === right.transactionTime
        ? left.paymentId.localeCompare(right.paymentId)
        : left.transactionTime.localeCompare(right.transactionTime),
    );
  const currency =
    sources.ledgerEntries[0]?.amount.currency ??
    sales[0]?.amount.currency ??
    payments[0]?.amount.currency ??
    "VND";

  if (
    [...sources.sales, ...sources.payments, ...sources.ledgerEntries].some(
      (source) => source.amount.currency !== currency,
    )
  ) {
    diagnostics.add("mixed_currency");
  }

  const allocationBySale = new Map<SaleId, number>();
  const allocationByPayment = new Map<PaymentId, number>();
  const orderedSales = [...sales].sort((left, right) => {
    if (allocationStrategy === "oldest_due_first") {
      const leftDue = left.dueAt ?? "9999-12-31T00:00:00.000Z";
      const rightDue = right.dueAt ?? "9999-12-31T00:00:00.000Z";
      if (leftDue !== rightDue) return leftDue.localeCompare(rightDue);
    }
    return left.transactionTime === right.transactionTime
      ? left.saleId.localeCompare(right.saleId)
      : left.transactionTime.localeCompare(right.transactionTime);
  });
  const remainingBySale = new Map(
    orderedSales.map((sale) => [sale.saleId, sale.amount.amountMinor]),
  );

  const applyAllocation = (paymentId: PaymentId, saleId: SaleId, amountMinor: number): void => {
    const payment = payments.find((item) => item.paymentId === paymentId);
    const sale = sales.find((item) => item.saleId === saleId);
    if (payment === undefined || sale === undefined) {
      diagnostics.add("allocation_source_missing");
      return;
    }
    const allocatedToPayment = allocationByPayment.get(paymentId) ?? 0;
    const allocatedToSale = allocationBySale.get(saleId) ?? 0;
    const paymentRemaining = payment.effectiveAmount - allocatedToPayment;
    const saleRemaining = sale.amount.amountMinor - allocatedToSale;
    if (amountMinor > paymentRemaining) diagnostics.add("payment_allocation_exceeds_payment");
    if (amountMinor > saleRemaining) diagnostics.add("payment_allocation_exceeds_sale");
    const accepted = Math.min(
      amountMinor,
      Math.max(0, paymentRemaining),
      Math.max(0, saleRemaining),
    );
    if (accepted <= 0) return;
    allocationBySale.set(saleId, allocatedToSale + accepted);
    allocationByPayment.set(paymentId, allocatedToPayment + accepted);
  };

  if (
    allocationStrategy === "oldest_due_first" ||
    allocationStrategy === "oldest_transaction_first"
  ) {
    for (const payment of payments) {
      let remaining = payment.effectiveAmount;
      for (const sale of orderedSales) {
        if (remaining <= 0) break;
        const available = remainingBySale.get(sale.saleId) ?? 0;
        const allocated = Math.min(remaining, available);
        if (allocated <= 0) continue;
        remainingBySale.set(sale.saleId, available - allocated);
        allocationBySale.set(sale.saleId, (allocationBySale.get(sale.saleId) ?? 0) + allocated);
        allocationByPayment.set(
          payment.paymentId,
          (allocationByPayment.get(payment.paymentId) ?? 0) + allocated,
        );
        remaining -= allocated;
      }
    }
  } else if (allocationStrategy === "manual" || allocationStrategy === "specific_sale") {
    const reversalsByAllocation = new Map<PaymentAllocationId, number>();
    for (const reversal of sources.allocationReversals) {
      if (reversal.transactionTime > asOf) continue;
      reversalsByAllocation.set(
        reversal.allocationId,
        (reversalsByAllocation.get(reversal.allocationId) ?? 0) + reversal.amount.amountMinor,
      );
    }
    const allocations = [...sources.allocations]
      .filter((allocation) => allocation.transactionTime <= asOf)
      .sort((left, right) =>
        left.transactionTime === right.transactionTime
          ? left.allocationId.localeCompare(right.allocationId)
          : left.transactionTime.localeCompare(right.transactionTime),
      );
    for (const allocation of allocations) {
      const reversed = reversalsByAllocation.get(allocation.allocationId) ?? 0;
      if (reversed > allocation.amount.amountMinor) {
        diagnostics.add("allocation_reversal_exceeds_allocation");
      }
      applyAllocation(
        allocation.paymentId,
        allocation.saleId,
        Math.max(0, allocation.amount.amountMinor - reversed),
      );
    }
    if (payments.some((payment) => payment.effectiveAmount > 0) && allocations.length === 0) {
      diagnostics.add("manual_allocation_not_recorded");
    }
  } else if (sources.allocations.length > 0 || sources.allocationReversals.length > 0) {
    diagnostics.add("persisted_allocations_conflict_with_policy");
  }

  const rows: DebtAgingSaleRow[] = sales.map((sale) => {
    const allocatedMinor = allocationBySale.get(sale.saleId) ?? 0;
    const outstandingMinor = Math.max(0, sale.amount.amountMinor - allocatedMinor);
    const state = stateFor(sale.dueAt, asOf, terms.parameters.graceDays);
    const overdueDays =
      outstandingMinor === 0 ? 0 : daysOverdue(sale.dueAt, asOf, terms.parameters.graceDays);
    const bucketCode = outstandingMinor === 0 ? null : bucketFor(overdueDays, terms);
    const termSource = sale.paymentTermsSource ?? (sale.dueAt === null ? "none" : "sale_override");
    const termPolicyVersionId = sale.paymentTermsPolicyVersionId ?? null;
    if (
      (termSource === "customer_policy" || termSource === "workspace_policy") &&
      termPolicyVersionId === null
    ) {
      diagnostics.add("sale_term_policy_lineage_missing");
    }
    return {
      saleId: sale.saleId,
      customerId: sale.customerId,
      saleAmount: sale.amount,
      allocatedAmount: positiveMoney(allocatedMinor, sale.amount.currency),
      outstandingAmount: positiveMoney(outstandingMinor, sale.amount.currency),
      transactionTime: sale.transactionTime,
      dueAt: sale.dueAt,
      state: outstandingMinor === 0 ? "settled" : state,
      bucketCode,
      daysOverdue: overdueDays,
      termSource,
      termPolicyVersionId,
      sourceReferences: [{ type: "sale_posting", id: sale.saleId, entryId: null }],
    };
  });

  const paymentRows: DebtAgingPaymentRow[] = payments.map((payment) => {
    const allocatedMinor = allocationByPayment.get(payment.paymentId) ?? 0;
    const unallocatedMinor = Math.max(0, payment.effectiveAmount - allocatedMinor);
    return {
      paymentId: payment.paymentId,
      customerId: payment.customerId,
      paymentAmount: payment.amount,
      reversedAmount: { amountMinor: payment.reversedAmount, currency: payment.amount.currency },
      effectiveAmount: { amountMinor: payment.effectiveAmount, currency: payment.amount.currency },
      allocatedAmount: { amountMinor: allocatedMinor, currency: payment.amount.currency },
      unallocatedAmount: { amountMinor: unallocatedMinor, currency: payment.amount.currency },
      transactionTime: payment.transactionTime,
      state:
        allocatedMinor === 0
          ? "unallocated"
          : unallocatedMinor === 0
            ? "allocated"
            : "partially_allocated",
      sourceReferences: [{ type: "payment", id: payment.paymentId, entryId: null }],
    };
  });

  const ledgerBalance = sumMoney(
    sources.ledgerEntries.map((entry) => entry.amount),
    currency,
  );
  const saleOutstanding = sumMoney(
    rows.map((row) => row.outstandingAmount),
    currency,
  );
  const effectivePayments = sumMoney(
    paymentRows.map((row) => row.effectiveAmount),
    currency,
  );
  const manualAdjustmentBalance = sumMoney(
    sources.ledgerEntries
      .filter((entry) => entry.sourceType === "manual_adjustment")
      .map((entry) => entry.amount),
    currency,
  );
  if (manualAdjustmentBalance.amountMinor !== 0) {
    // A manual adjustment changes the canonical customer balance but has no
    // sale obligation to which its amount can be aged. Reconciliation alone
    // must not make the sale rows look like a complete aging model.
    diagnostics.add("non_sale_balance_not_allocated");
  }
  const explainedSalesAndPayments = subtractMoney(
    sumMoney(
      sales.map((sale) => sale.amount),
      currency,
    ),
    effectivePayments,
  );
  const explainedBalance = {
    amountMinor: explainedSalesAndPayments.amountMinor + manualAdjustmentBalance.amountMinor,
    currency,
  };
  if (ledgerBalance.amountMinor !== explainedBalance.amountMinor) {
    diagnostics.add("ledger_not_explained_by_sales_and_payments");
  }

  const total = (state: DebtAgingState) =>
    sumMoney(
      rows.filter((row) => row.state === state).map((row) => row.outstandingAmount),
      currency,
    );
  const unallocatedPayment = sumMoney(
    paymentRows.map((row) => row.unallocatedAmount),
    currency,
  );
  return {
    rows,
    payments: paymentRows,
    totals: {
      ledgerBalance,
      saleOutstanding,
      overdue: total("overdue"),
      due: total("due"),
      notDue: total("not_due"),
      disputed: total("disputed"),
      customerCredit: positiveMoney(Math.max(0, -ledgerBalance.amountMinor), currency),
      unallocatedPayment,
    },
    diagnostics: [...diagnostics],
  };
}
