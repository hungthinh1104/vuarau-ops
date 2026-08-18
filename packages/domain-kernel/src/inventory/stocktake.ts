import type {
  ApproveStocktakeCommand,
  ProductId,
  QualityGradeId,
  RecordStocktakeCountCommand,
  ReopenStocktakeCommand,
  StartStocktakeCommand,
  StocktakeCountDto,
  StocktakeCountId,
  StocktakeDto,
  StocktakePreviewDto,
  StocktakeState,
  StocktakeVarianceRow,
} from "@vuarau/domain-contracts";
import type {
  InventoryMovementState,
  StocktakeCountState,
  StocktakeSessionState,
} from "../shared/state.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";
import { sumExactIntegers } from "../shared/money.ts";

function countKey(count: {
  productId: string;
  qualityGradeId: string | null;
  quantity: { unit: string };
}): string {
  return `${count.productId}:${count.qualityGradeId ?? "ungraded"}:${count.quantity.unit}`;
}

export function decideStartStocktake(
  command: StartStocktakeCommand,
  policyVersionId: StocktakeSessionState["policyVersionId"],
  recordedAt: string,
): DomainResult<StocktakeSessionState> {
  return ok({
    id: command.payload.stocktakeSessionId,
    workspaceId: command.workspaceId,
    asOf: command.payload.asOf,
    scopeReference: command.payload.scopeReference.trim(),
    note: command.payload.note?.trim() || null,
    status: "draft",
    version: 1,
    policyVersionId,
    counts: [],
    varianceMovementIds: [],
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
    commandId: command.commandId,
    evidenceReferences: [...command.payload.evidenceReferences],
  });
}

export function decideRecordStocktakeCount(args: {
  readonly session: StocktakeSessionState;
  readonly existingCounts: readonly StocktakeCountState[];
  readonly command: RecordStocktakeCountCommand;
  readonly recordedAt: string;
}): DomainResult<{ readonly count: StocktakeCountState; readonly session: StocktakeSessionState }> {
  const { session, command, recordedAt } = args;
  if (session.status !== "draft" && session.status !== "reopened") {
    return err("STOCKTAKE_STATE_INVALID", "Counts can only be recorded in an open stocktake.");
  }
  if (command.payload.quantity.valueScaled < 0) {
    return err("STOCKTAKE_COUNT_INVALID", "A physical count cannot be negative.");
  }
  if (command.payload.supersedesCountId !== null) {
    const target = args.existingCounts.find(
      (count) => count.id === command.payload.supersedesCountId,
    );
    if (target === undefined || target.sessionId !== session.id) {
      return err("STOCKTAKE_COUNT_INVALID", "The corrected count is not part of this session.");
    }
    if (
      target.productId !== command.payload.productId ||
      target.qualityGradeId !== command.payload.qualityGradeId ||
      target.quantity.unit !== command.payload.quantity.unit
    ) {
      return err("STOCKTAKE_COUNT_INVALID", "A corrected count must keep the counted identity.");
    }
    if (args.existingCounts.some((count) => count.supersedesCountId === target.id)) {
      return err(
        "STOCKTAKE_COUNT_INVALID",
        "Only the current count in a correction chain may be superseded.",
      );
    }
  } else if (
    args.existingCounts.some(
      (count) =>
        countKey(count) ===
        countKey({
          productId: command.payload.productId,
          qualityGradeId: command.payload.qualityGradeId,
          quantity: { unit: command.payload.quantity.unit },
        }),
    )
  ) {
    return err("STOCKTAKE_COUNT_DUPLICATE", "This product and grade already has a count.");
  }
  const count: StocktakeCountState = {
    id: command.payload.stocktakeCountId,
    workspaceId: command.workspaceId,
    sessionId: session.id,
    productId: command.payload.productId,
    qualityGradeId: command.payload.qualityGradeId,
    qualityGradeName: command.payload.qualityGradeName,
    quantity: { ...command.payload.quantity },
    supersedesCountId: command.payload.supersedesCountId,
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
    commandId: command.commandId,
    evidenceReferences: [...command.payload.evidenceReferences],
  };
  return ok({
    count,
    session: { ...session, version: session.version + 1, counts: [...session.counts, count] },
  });
}

export function activeStocktakeCounts(
  counts: readonly StocktakeCountState[],
): readonly StocktakeCountState[] {
  const supersededIds = new Set(
    counts.map((c) => c.supersedesCountId).filter((id): id is StocktakeCountId => id !== null),
  );
  return counts
    .filter((c) => !supersededIds.has(c.id))
    .sort((left, right) => countKey(left).localeCompare(countKey(right)));
}

function sha256Hex(str: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0xd800 || code >= 0xe000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      i++;
      code = 0x10000 + (((code & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }

  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) {
    bytes.push(0);
  }

  const hi = Math.floor(bitLength / 0x100000000);
  const lo = bitLength >>> 0;
  bytes.push(
    (hi >>> 24) & 0xff,
    (hi >>> 16) & 0xff,
    (hi >>> 8) & 0xff,
    hi & 0xff,
    (lo >>> 24) & 0xff,
    (lo >>> 16) & 0xff,
    (lo >>> 8) & 0xff,
    lo & 0xff,
  );

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x3910e4ec, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0x0bef9a3f, 0xc67178f2,
  ];

  const w = new Uint32Array(64);

  for (let chunk = 0; chunk < bytes.length; chunk += 64) {
    for (let i = 0; i < 16; i++) {
      const idx = chunk + i * 4;
      w[i] =
        ((bytes[idx]! << 24) |
          (bytes[idx + 1]! << 16) |
          (bytes[idx + 2]! << 8) |
          bytes[idx + 3]!) >>>
        0;
    }
    for (let i = 16; i < 64; i++) {
      const w15 = w[i - 2]!;
      const s1 = ((w15 >>> 17) | (w15 << 15)) ^ ((w15 >>> 19) | (w15 << 13)) ^ (w15 >>> 10);
      const w2 = w[i - 15]!;
      const s0 = ((w2 >>> 7) | (w2 << 25)) ^ ((w2 >>> 18) | (w2 << 14)) ^ (w2 >>> 3);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + k[i]! + w[i]!) >>> 0;
      const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map((val) => val.toString(16).padStart(8, "0")).join("");
}

export function computeStocktakePreviewHash(args: {
  readonly sessionId: string;
  readonly sessionVersion: number;
  readonly policyVersionId: string;
  readonly asOf: string;
  readonly rows: readonly StocktakeVarianceRow[];
}): string {
  const sortedRows = [...args.rows].sort((left, right) => {
    const productComp = left.productId.localeCompare(right.productId);
    if (productComp !== 0) return productComp;
    const gradeComp = (left.qualityGradeId ?? "").localeCompare(right.qualityGradeId ?? "");
    if (gradeComp !== 0) return gradeComp;
    return left.unit.localeCompare(right.unit);
  });
  const lines = [
    "stocktake-preview-v1",
    args.sessionId,
    String(args.sessionVersion),
    args.policyVersionId,
    args.asOf,
    ...sortedRows.map(
      (row) =>
        `${row.productId}:${row.qualityGradeId ?? "ungraded"}:${row.unit}:${row.expectedQuantityScaled}:${row.countedQuantityScaled}:${row.varianceScaled}`,
    ),
  ].join("\n");
  return sha256Hex(lines);
}

export function buildStocktakePreview(args: {
  readonly session: StocktakeSessionState;
  readonly aggregates: readonly {
    readonly productId: ProductId;
    readonly qualityGradeId: QualityGradeId | null;
    readonly unit: string;
    readonly quantityScaled: number | null;
  }[];
}): DomainResult<StocktakePreviewDto> {
  const active = activeStocktakeCounts(args.session.counts);
  const aggregateByScope = new Map<string, number | null>(
    args.aggregates.map((agg) => [
      `${agg.productId}:${agg.qualityGradeId ?? "ungraded"}:${agg.unit}`,
      agg.quantityScaled,
    ]),
  );

  const rows: StocktakeVarianceRow[] = [];
  for (const count of active) {
    const scopeKey = `${count.productId}:${count.qualityGradeId ?? "ungraded"}:${count.quantity.unit}`;
    const aggregate = aggregateByScope.get(scopeKey);
    const expected = aggregate === undefined ? 0 : aggregate;
    if (expected === null) {
      return err(
        "STOCKTAKE_COUNT_INVALID",
        "Persisted inventory is outside the supported exact quantity range.",
      );
    }
    const variance = count.quantity.valueScaled - expected;
    if (!Number.isSafeInteger(variance)) {
      return err(
        "STOCKTAKE_COUNT_INVALID",
        "Stocktake variance is outside the supported exact quantity range.",
      );
    }
    rows.push({
      productId: count.productId,
      qualityGradeId: count.qualityGradeId,
      qualityGradeName: count.qualityGradeName,
      unit: count.quantity.unit,
      expectedQuantityScaled: expected,
      countedQuantityScaled: count.quantity.valueScaled,
      varianceScaled: variance,
      activeCountId: count.id,
    });
  }

  const sortedRows = [...rows].sort((left, right) => {
    const productComp = left.productId.localeCompare(right.productId);
    if (productComp !== 0) return productComp;
    const gradeComp = (left.qualityGradeId ?? "").localeCompare(right.qualityGradeId ?? "");
    if (gradeComp !== 0) return gradeComp;
    return left.unit.localeCompare(right.unit);
  });

  const previewHash = computeStocktakePreviewHash({
    sessionId: args.session.id,
    sessionVersion: args.session.version,
    policyVersionId: args.session.policyVersionId,
    asOf: args.session.asOf,
    rows: sortedRows,
  });

  return ok({
    calculationVersion: "stocktake-preview-v1",
    stocktakeSessionId: args.session.id,
    sessionVersion: args.session.version,
    asOf: args.session.asOf,
    rows: sortedRows,
    previewHash,
  });
}

export function decideApproveStocktake(args: {
  readonly session: StocktakeSessionState;
  readonly command: ApproveStocktakeCommand;
}): DomainResult<StocktakeSessionState> {
  if (args.session.status !== "draft" && args.session.status !== "reopened") {
    return err("STOCKTAKE_STATE_INVALID", "Only an open stocktake can be approved.");
  }
  if (args.session.counts.length === 0) {
    return err("STOCKTAKE_COUNT_INVALID", "A stocktake needs at least one count before approval.");
  }
  return ok({ ...args.session, status: "approved", version: args.session.version + 1 });
}

export function decideReopenStocktake(args: {
  readonly session: StocktakeSessionState;
  readonly command: ReopenStocktakeCommand;
  readonly allowReopen: boolean;
}): DomainResult<StocktakeSessionState> {
  if (!args.allowReopen) {
    return err(
      "STOCKTAKE_STATE_INVALID",
      "This workspace policy does not allow reopening stocktake.",
    );
  }
  if (args.session.status !== "approved") {
    return err("STOCKTAKE_STATE_INVALID", "Only an approved stocktake can be reopened.");
  }
  return ok({ ...args.session, status: "reopened", version: args.session.version + 1 });
}

export function calculateStocktakeExpectedQuantity(args: {
  readonly movements: readonly Pick<InventoryMovementState, "quantity" | "transactionTime">[];
  readonly asOf: string;
}): number | null {
  let total = 0;
  for (const movement of args.movements) {
    if (Date.parse(movement.transactionTime) > Date.parse(args.asOf)) continue;
    const next = sumExactIntegers([total, movement.quantity.valueScaled]);
    if (next === null) return null;
    total = next;
  }
  return total;
}

export function stocktakeCountDto(count: StocktakeCountState): StocktakeCountDto {
  return { ...count, evidenceReferences: [...count.evidenceReferences] };
}

export function stocktakeDto(session: StocktakeSessionState): StocktakeDto {
  const active = activeStocktakeCounts(session.counts);
  return {
    ...session,
    counts: session.counts.map(stocktakeCountDto),
    activeCounts: active.map(stocktakeCountDto),
    varianceMovementIds: [...session.varianceMovementIds],
    evidenceReferences: [...session.evidenceReferences],
  };
}

export type StocktakeStatus = StocktakeState;
