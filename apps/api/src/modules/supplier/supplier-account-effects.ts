import type {
  CurrencyCode,
  SupplierAccountEntryDto,
  SupplierId,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import { addMoney, zeroMoney } from "@vuarau/domain-kernel";
import type {
  Repositories,
  SupplierAccountEntryDraft,
} from "../../infrastructure/persistence/ports.ts";

export async function applySupplierAccountEffects(
  repos: Repositories,
  drafts: readonly SupplierAccountEntryDraft[],
  currency: CurrencyCode,
): Promise<readonly SupplierAccountEntryDto[]> {
  if (drafts.length === 0) return [];
  const appended = await repos.supplierAccountEntries.append(drafts);
  const affected = new Map<string, { workspaceId: WorkspaceId; supplierId: SupplierId }>();
  for (const entry of appended) {
    affected.set(`${entry.workspaceId}:${entry.supplierId}`, {
      workspaceId: entry.workspaceId,
      supplierId: entry.supplierId,
    });
  }
  for (const target of affected.values()) {
    const current = await repos.supplierAccountBalances.get(target.workspaceId, target.supplierId);
    const newEntries = appended.filter(
      (entry) => entry.workspaceId === target.workspaceId && entry.supplierId === target.supplierId,
    );
    let balance = current?.balance ?? zeroMoney(currency);
    let last = current?.lastEntryTransactionTime ?? null;
    for (const entry of newEntries) {
      balance = addMoney(balance, entry.amount);
      if (last === null || entry.transactionTime > last) last = entry.transactionTime;
    }
    await repos.supplierAccountBalances.save({
      workspaceId: target.workspaceId,
      supplierId: target.supplierId,
      balance,
      entryCount: (current?.entryCount ?? 0) + newEntries.length,
      lastEntryTransactionTime: last,
      updatedAt: newEntries[newEntries.length - 1]!.recordedAt,
    });
  }
  return appended;
}

export async function rebuildSupplierAccountBalance(
  repos: Repositories,
  workspaceId: WorkspaceId,
  supplierId: SupplierId,
  currency: CurrencyCode,
  updatedAt: SupplierAccountEntryDto["recordedAt"],
) {
  const entries = await repos.supplierAccountEntries.listBySupplier(workspaceId, supplierId);
  let balance = zeroMoney(currency);
  let last: SupplierAccountEntryDto["transactionTime"] | null = null;
  for (const entry of entries) {
    balance = addMoney(balance, entry.amount);
    if (last === null || entry.transactionTime > last) last = entry.transactionTime;
  }
  const result = {
    workspaceId,
    supplierId,
    balance,
    entryCount: entries.length,
    lastEntryTransactionTime: last,
    updatedAt,
  };
  await repos.supplierAccountBalances.save(result);
  return result;
}
