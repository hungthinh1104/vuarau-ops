import type {
  AccountReconciliationDiagnostic,
  AccountReconciliationResultDto,
  CustomerAccountEntryDto,
  CustomerId,
  Money,
  WorkspaceId,
  WorkspaceRole,
} from "@vuarau/domain-contracts";
import { ALLOWED, DEFAULT_CURRENCY, denied, roleHasPermission } from "@vuarau/domain-contracts";
import type { CustomerAccountBalance } from "@vuarau/domain-kernel";
import { calculateAccountBalance, classifyBalance, money } from "@vuarau/domain-kernel";
import type { Repositories } from "../../infrastructure/persistence/ports.ts";
import type { AccountSourceObservation } from "../../infrastructure/persistence/read-ports.ts";

type ReconciliationData = {
  readonly workspaceId: WorkspaceId;
  readonly workspaceName: string | null;
  readonly customerId: CustomerId;
  readonly customerDisplayName: string | null;
  readonly projection: CustomerAccountBalance | null;
  readonly entries: readonly CustomerAccountEntryDto[];
  readonly observations: readonly AccountSourceObservation[];
  readonly role: WorkspaceRole;
};

const canonicalEntryOrder = (a: CustomerAccountEntryDto, b: CustomerAccountEntryDto): number =>
  a.transactionTime.localeCompare(b.transactionTime) ||
  a.recordedAt.localeCompare(b.recordedAt) ||
  a.id.localeCompare(b.id);

function diagnostic(
  code: AccountReconciliationDiagnostic["code"],
  entry: CustomerAccountEntryDto | null = null,
): AccountReconciliationDiagnostic {
  return {
    code,
    entryId: entry?.id ?? null,
    sourceType: entry?.sourceType ?? null,
    sourceId: entry?.sourceId ?? null,
  };
}

const INTEGRITY_CODES = new Set<AccountReconciliationDiagnostic["code"]>([
  "ledger_currency_mismatch",
  "ledger_zero_amount",
  "duplicate_source_identity",
  "source_missing",
  "source_workspace_mismatch",
  "source_customer_mismatch",
  "source_amount_mismatch",
  "malformed_source_reference",
]);

export function buildAccountReconciliation(
  data: ReconciliationData,
): AccountReconciliationResultDto {
  if (data.customerDisplayName === null) {
    return {
      kind: "not_found",
      workspaceId: data.workspaceId,
      customerId: data.customerId,
    };
  }

  if (data.workspaceName === null) {
    return {
      kind: "integrity_failure",
      workspaceId: data.workspaceId,
      customerId: data.customerId,
      diagnostics: [diagnostic("malformed_source_reference")],
    };
  }

  const entries = [...data.entries].sort(canonicalEntryOrder);
  const observationByEntry = new Map(
    data.observations.map((observation) => [observation.entryId, observation]),
  );
  const diagnostics: AccountReconciliationDiagnostic[] = [];
  const sourceKeys = new Set<string>();
  const currency =
    entries[0]?.amount.currency ?? data.projection?.balance.currency ?? DEFAULT_CURRENCY;

  for (const entry of entries) {
    if (entry.amount.amountMinor === 0) {
      diagnostics.push(diagnostic("ledger_zero_amount", entry));
    }
    if (entry.amount.currency !== currency) {
      diagnostics.push(diagnostic("ledger_currency_mismatch", entry));
    }
    if (
      entry.sourceType === "manual_adjustment" &&
      (entry.reasonCode === null || entry.reason === null || entry.reason.trim().length === 0)
    ) {
      diagnostics.push(diagnostic("malformed_source_reference", entry));
    }

    const sourceKey = `${entry.sourceType}:${entry.sourceId}`;
    if (sourceKeys.has(sourceKey)) {
      diagnostics.push(diagnostic("duplicate_source_identity", entry));
    }
    sourceKeys.add(sourceKey);

    const observation = observationByEntry.get(entry.id);
    if (observation === undefined || !observation.reversalTargetExists) {
      diagnostics.push(diagnostic("malformed_source_reference", entry));
      continue;
    }
    if (!observation.sourceExists) {
      diagnostics.push(diagnostic("source_missing", entry));
      continue;
    }
    if (observation.sourceWorkspaceId !== data.workspaceId) {
      diagnostics.push(diagnostic("source_workspace_mismatch", entry));
    }
    if (observation.sourceCustomerId !== data.customerId) {
      diagnostics.push(diagnostic("source_customer_mismatch", entry));
    }
    if (
      observation.expectedAmount === null ||
      observation.expectedAmount.currency !== entry.amount.currency
    ) {
      diagnostics.push(diagnostic("malformed_source_reference", entry));
    } else if (observation.expectedAmount.amountMinor !== entry.amount.amountMinor) {
      diagnostics.push(diagnostic("source_amount_mismatch", entry));
    }
  }

  const ledgerBalance = calculateAccountBalance(entries, currency);
  const latestTransactionTime = entries.reduce<string | null>(
    (latest, entry) =>
      latest === null || entry.transactionTime > latest ? entry.transactionTime : latest,
    null,
  ) as CustomerAccountBalance["lastEntryTransactionTime"];
  const latestRecordedAt = entries.reduce<string | null>(
    (latest, entry) => (latest === null || entry.recordedAt > latest ? entry.recordedAt : latest),
    null,
  ) as CustomerAccountEntryDto["recordedAt"] | null;

  if (entries.length > 0 && data.projection === null) {
    diagnostics.push(diagnostic("projection_missing"));
  } else if (data.projection !== null) {
    if (
      data.projection.balance.currency !== currency ||
      data.projection.balance.amountMinor !== ledgerBalance.amountMinor
    ) {
      diagnostics.push(diagnostic("projection_balance_mismatch"));
    }
    if (data.projection.entryCount !== entries.length) {
      diagnostics.push(diagnostic("projection_entry_count_mismatch"));
    }
    if (data.projection.lastEntryTransactionTime !== latestTransactionTime) {
      diagnostics.push(diagnostic("projection_last_transaction_mismatch"));
    }
  }

  if (diagnostics.some((item) => INTEGRITY_CODES.has(item.code))) {
    return {
      kind: "integrity_failure",
      workspaceId: data.workspaceId,
      customerId: data.customerId,
      diagnostics,
    };
  }

  const projectedBalance: Money = data.projection?.balance ?? money(0, currency);
  const difference = money(
    projectedBalance.amountMinor - ledgerBalance.amountMinor,
    ledgerBalance.currency,
  );
  const common = {
    workspace: { id: data.workspaceId, name: data.workspaceName },
    customer: { id: data.customerId, displayName: data.customerDisplayName },
    projection:
      data.projection === null
        ? null
        : {
            balance: data.projection.balance,
            entryCount: data.projection.entryCount,
            lastEntryTransactionTime: data.projection.lastEntryTransactionTime,
            updatedAt: data.projection.updatedAt,
          },
    ledger: {
      balance: ledgerBalance,
      classification: classifyBalance(ledgerBalance),
      entryCount: entries.length,
      latestTransactionTime,
      latestRecordedAt,
    },
    difference,
    diagnostics,
    capabilities: {
      rebuild: roleHasPermission(data.role, "debt.adjust")
        ? ALLOWED
        : denied("PERMISSION_DENIED", { permission: "debt.adjust", role: data.role }),
    },
  };

  return diagnostics.length === 0
    ? { kind: "consistent", ...common }
    : { kind: "inconsistent", ...common };
}

export async function loadAccountReconciliation(args: {
  repos: Repositories;
  workspaceId: WorkspaceId;
  customerId: CustomerId;
  role: WorkspaceRole;
}): Promise<AccountReconciliationResultDto> {
  const [workspaceName, customer, projection, entries, observations] = await Promise.all([
    args.repos.workspaces.findName(args.workspaceId),
    args.repos.customerReads.get(args.workspaceId, args.customerId),
    args.repos.accountBalances.get(args.workspaceId, args.customerId),
    args.repos.accountEntries.listByCustomer(args.workspaceId, args.customerId),
    args.repos.accountReads.sourceObservations({
      workspaceId: args.workspaceId,
      customerId: args.customerId,
    }),
  ]);

  return buildAccountReconciliation({
    workspaceId: args.workspaceId,
    workspaceName,
    customerId: args.customerId,
    customerDisplayName: customer?.customer.displayName ?? null,
    projection,
    entries,
    observations,
    role: args.role,
  });
}

export function isProjectionOnlyDrift(reconciliation: AccountReconciliationResultDto): boolean {
  return (
    reconciliation.kind === "inconsistent" &&
    reconciliation.diagnostics.every((item) => item.code.startsWith("projection_"))
  );
}
