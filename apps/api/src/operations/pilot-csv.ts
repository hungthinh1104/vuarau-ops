import { createHash } from "node:crypto";
import type {
  CommandId,
  CustomerId,
  IdempotencyKey,
  ProductId,
  Unit,
} from "@vuarau/domain-contracts";
import { UNITS } from "@vuarau/domain-contracts";
import { deterministicUuid } from "../infrastructure/deterministic-id.ts";

/**
 * Reading a depot's customer list out of a spreadsheet, and refusing to guess.
 *
 * A pilot needs the worker's **own** customers: recognising a name is most of the
 * speed, and a stranger's list measures reading rather than recording
 * (docs/00-product/validation-plan.md). Typing forty names into the app before a
 * session is the facilitator's job, not the worker's, and there is deliberately no
 * screen for it — an import UI is a second way to create customers, with its own
 * validation and its own bugs, for a job done once per depot.
 *
 * Everything here is pure: text in, rows and problems out. The file is parsed and
 * judged completely before anything is written, which is what makes "all or
 * nothing" possible at all (BR-CUSTOMER-005).
 */

/** What a row becomes if the whole file is accepted. */
export type ImportRow = {
  /** 1-based, counting the header as row 1 — what a spreadsheet shows. */
  readonly line: number;
  readonly displayName: string;
  readonly phone: string | null;
  readonly note: string | null;
  /**
   * Derived from the file and the row rather than minted, so re-running the same
   * file after a crash is a **replay** and not a second set of customers
   * (BR-COMMAND-001). The command's payload has to match on a replay, so the id
   * has to be derived too — a fresh uuid would be a different payload under the
   * same key, which is a rejection rather than a replay.
   */
  readonly customerId: CustomerId;
  readonly commandId: CommandId;
  readonly idempotencyKey: IdempotencyKey;
};

export type ProductImportRow = {
  readonly line: number;
  readonly displayName: string;
  readonly aliases: readonly string[];
  readonly preferredUnit: Unit | null;
  readonly productId: ProductId;
  readonly commandId: CommandId;
  readonly idempotencyKey: IdempotencyKey;
};

export type RowProblem = {
  readonly line: number;
  readonly column: string;
  readonly problem: string;
};

/** Not an error: a duplicate name is legal (ASM-012), and worth seeing anyway. */
export type RowWarning = {
  readonly line: number;
  readonly warning: string;
};

export type ParsedImport<TRow = ImportRow> = {
  /** Data rows in the input, including rows rejected during validation. */
  readonly inputRows: number;
  readonly rows: readonly TRow[];
  readonly problems: readonly RowProblem[];
  readonly warnings: readonly RowWarning[];
  /** Identifies this file, so two different files never share idempotency keys. */
  readonly batchId: string;
};

/**
 * Header spellings accepted, in both languages.
 *
 * A facilitator exports from a phone or types the header themselves, and refusing
 * `ten` because the code was written in English is the sort of friction that ends
 * with somebody hand-inserting rows.
 */
const NAME_HEADERS = ["name", "ten", "tên", "ten_khach", "khach_hang", "khách hàng"];
const PHONE_HEADERS = ["phone", "dien_thoai", "điện thoại", "sdt", "số điện thoại"];
const NOTE_HEADERS = ["note", "ghi_chu", "ghi chú", "ghichu"];

/**
 * A small CSV reader, rather than a dependency.
 *
 * It handles what a spreadsheet actually emits — a UTF-8 BOM, CRLF, quoted fields
 * containing commas, and doubled quotes — and nothing else. No new dependency
 * without a stated reason (CLAUDE.md), and a parser for a two-column customer list
 * is thirty lines that can be read in one sitting.
 */
export function parseCsv(text: string): string[][] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;

    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // A trailing newline produces one empty row; a blank line in the middle of a
  // file is a mistake worth reporting, so only the last one is dropped.
  return rows.filter(
    (entry, position) => position < rows.length - 1 || entry.some((v) => v !== ""),
  );
}

const blank = (value: string | undefined): boolean => (value ?? "").trim().length === 0;

/**
 * Parses and judges a whole file. Nothing is written and nothing is decided here.
 *
 * Limits match `createCustomerPayloadSchema` exactly, so a row this accepts cannot
 * be refused by the command later — a file that validated and then failed halfway
 * through is precisely the outcome BR-CUSTOMER-005 exists to prevent.
 */
export function readCustomerCsv(text: string, workspaceId: string): ParsedImport {
  const batchId = createHash("sha256").update(text).digest("hex").slice(0, 16);
  const table = parseCsv(text);
  const problems: RowProblem[] = [];
  const warnings: RowWarning[] = [];

  if (table.length === 0) {
    return {
      rows: [],
      inputRows: 0,
      problems: [{ line: 1, column: "-", problem: "Tệp rỗng." }],
      warnings,
      batchId,
    };
  }

  const header = table[0]!.map((cell) => cell.trim().toLowerCase());
  const nameAt = header.findIndex((cell) => NAME_HEADERS.includes(cell));
  const phoneAt = header.findIndex((cell) => PHONE_HEADERS.includes(cell));
  const noteAt = header.findIndex((cell) => NOTE_HEADERS.includes(cell));

  if (nameAt < 0) {
    return {
      rows: [],
      inputRows: Math.max(0, table.length - 1),
      problems: [
        {
          line: 1,
          column: "header",
          problem: `Không tìm thấy cột tên. Chấp nhận: ${NAME_HEADERS.join(", ")}.`,
        },
      ],
      warnings,
      batchId,
    };
  }

  const rows: ImportRow[] = [];
  const seenNames = new Map<string, number>();

  for (let index = 1; index < table.length; index += 1) {
    const line = index + 1;
    const cells = table[index]!;
    if (cells.every((cell) => cell.trim().length === 0)) {
      problems.push({ line, column: "-", problem: "Dòng trống." });
      continue;
    }

    const displayName = (cells[nameAt] ?? "").trim();
    const phoneRaw = phoneAt >= 0 ? (cells[phoneAt] ?? "").trim() : "";
    const noteRaw = noteAt >= 0 ? (cells[noteAt] ?? "").trim() : "";

    if (blank(displayName)) {
      problems.push({ line, column: "name", problem: "Thiếu tên khách hàng." });
      continue;
    }
    if (displayName.length > 200) {
      problems.push({ line, column: "name", problem: "Tên dài quá 200 ký tự." });
      continue;
    }
    if (phoneRaw.length > 40) {
      problems.push({ line, column: "phone", problem: "Số điện thoại dài quá 40 ký tự." });
      continue;
    }
    if (noteRaw.length > 1000) {
      problems.push({ line, column: "note", problem: "Ghi chú dài quá 1000 ký tự." });
      continue;
    }

    // Legal, and worth seeing: two customers may genuinely share a name, and a
    // misattributed balance is the failure that closes ASM-012.
    const firstSeen = seenNames.get(displayName.toLowerCase());
    if (firstSeen !== undefined) {
      warnings.push({ line, warning: `Trùng tên với dòng ${firstSeen}: "${displayName}".` });
    } else {
      seenNames.set(displayName.toLowerCase(), line);
    }

    rows.push({
      line,
      displayName,
      phone: phoneRaw.length === 0 ? null : phoneRaw,
      note: noteRaw.length === 0 ? null : noteRaw,
      customerId: deterministicUuid(
        `vuarau:pilot-import:customer:${workspaceId}:${batchId}`,
        String(line),
      ) as CustomerId,
      commandId: deterministicUuid(
        `vuarau:pilot-import:customer-command:${workspaceId}:${batchId}`,
        String(line),
      ) as CommandId,
      idempotencyKey: `pilot-import:customer:${batchId}:${line}` as IdempotencyKey,
    });
  }

  return { inputRows: Math.max(0, table.length - 1), rows, problems, warnings, batchId };
}

const PRODUCT_NAME_HEADERS = ["name", "ten", "tên", "ten_hang", "mặt hàng", "mat_hang"];
const ALIAS_HEADERS = ["aliases", "alias", "ten_khac", "tên khác"];
const UNIT_HEADERS = ["unit", "don_vi", "đơn vị"];

/** Product onboarding uses the same deterministic, workspace-scoped identity rules. */
export function readProductCsv(text: string, workspaceId: string): ParsedImport<ProductImportRow> {
  const batchId = createHash("sha256").update(text).digest("hex").slice(0, 16);
  const table = parseCsv(text);
  const problems: RowProblem[] = [];
  const warnings: RowWarning[] = [];
  const inputRows = Math.max(0, table.length - 1);

  if (table.length === 0) {
    return {
      inputRows: 0,
      rows: [],
      problems: [{ line: 1, column: "-", problem: "Tệp rỗng." }],
      warnings,
      batchId,
    };
  }

  const header = table[0]!.map((cell) => cell.trim().toLowerCase());
  const nameAt = header.findIndex((cell) => PRODUCT_NAME_HEADERS.includes(cell));
  const aliasesAt = header.findIndex((cell) => ALIAS_HEADERS.includes(cell));
  const unitAt = header.findIndex((cell) => UNIT_HEADERS.includes(cell));
  if (nameAt < 0) {
    return {
      inputRows,
      rows: [],
      problems: [
        {
          line: 1,
          column: "header",
          problem: `Không tìm thấy cột tên hàng. Chấp nhận: ${PRODUCT_NAME_HEADERS.join(", ")}.`,
        },
      ],
      warnings,
      batchId,
    };
  }

  const rows: ProductImportRow[] = [];
  const seenNames = new Map<string, number>();
  for (let index = 1; index < table.length; index += 1) {
    const line = index + 1;
    const cells = table[index]!;
    if (cells.every((cell) => cell.trim().length === 0)) {
      problems.push({ line, column: "-", problem: "Dòng trống." });
      continue;
    }
    const displayName = (cells[nameAt] ?? "").trim();
    const aliases =
      aliasesAt < 0
        ? []
        : (cells[aliasesAt] ?? "")
            .split("|")
            .map((alias) => alias.trim())
            .filter((alias) => alias.length > 0);
    const unitRaw = unitAt < 0 ? "" : (cells[unitAt] ?? "").trim().toLowerCase();

    if (displayName.length === 0) {
      problems.push({ line, column: "name", problem: "Thiếu tên mặt hàng." });
      continue;
    }
    if (displayName.length > 200) {
      problems.push({ line, column: "name", problem: "Tên dài quá 200 ký tự." });
      continue;
    }
    if (aliases.length > 30 || aliases.some((alias) => alias.length > 200)) {
      problems.push({
        line,
        column: "aliases",
        problem: "Tối đa 30 tên khác, mỗi tên không quá 200 ký tự.",
      });
      continue;
    }
    if (unitRaw.length > 0 && !(UNITS as readonly string[]).includes(unitRaw)) {
      problems.push({
        line,
        column: "unit",
        problem: `Đơn vị không hợp lệ. Chấp nhận: ${UNITS.join(", ")}.`,
      });
      continue;
    }

    const normalizedName = displayName.toLocaleLowerCase("vi");
    const firstSeen = seenNames.get(normalizedName);
    if (firstSeen === undefined) seenNames.set(normalizedName, line);
    else warnings.push({ line, warning: `Trùng tên với dòng ${firstSeen}: "${displayName}".` });

    rows.push({
      line,
      displayName,
      aliases,
      preferredUnit: unitRaw.length === 0 ? null : (unitRaw as Unit),
      productId: deterministicUuid(
        `vuarau:pilot-import:product:${workspaceId}:${batchId}`,
        String(line),
      ) as ProductId,
      commandId: deterministicUuid(
        `vuarau:pilot-import:product-command:${workspaceId}:${batchId}`,
        String(line),
      ) as CommandId,
      idempotencyKey: `pilot-import:product:${batchId}:${line}` as IdempotencyKey,
    });
  }

  return { inputRows, rows, problems, warnings, batchId };
}

/** The report, as text. Printed on every run, dry or not. */
export function formatReport<
  TRow extends {
    readonly line: number;
    readonly displayName: string;
    readonly customerId?: string;
    readonly productId?: string;
  },
>(
  parsed: ParsedImport<TRow>,
  outcome: {
    readonly mode: "dry-run" | "commit";
    readonly created: readonly { line: number; customerId: string }[];
    readonly replayed: readonly { line: number; customerId: string }[];
    readonly failed: readonly { line: number; code: string; message: string }[];
  },
): string {
  const lines: string[] = [];
  lines.push(`batch:    ${parsed.batchId}`);
  lines.push(`mode:     ${outcome.mode}`);
  lines.push(`input:    ${parsed.inputRows} row(s)`);
  lines.push(`accepted: ${parsed.rows.length} row(s)`);
  lines.push(`rejected: ${Math.max(0, parsed.inputRows - parsed.rows.length)} row(s)`);
  lines.push(`warnings: ${parsed.warnings.length}`);

  if (parsed.problems.length > 0) {
    lines.push("", "problems — nothing was written:");
    for (const problem of parsed.problems) {
      lines.push(`  line ${problem.line} [${problem.column}]: ${problem.problem}`);
    }
  }

  if (parsed.warnings.length > 0) {
    lines.push("", "warnings — accepted, and worth a look:");
    for (const warning of parsed.warnings) {
      lines.push(`  line ${warning.line}: ${warning.warning}`);
    }
  }

  if (outcome.mode === "dry-run" && parsed.problems.length === 0) {
    lines.push("", "would create:");
    for (const row of parsed.rows) {
      lines.push(
        `  line ${row.line}: ${row.displayName} → ${row.customerId ?? row.productId ?? "invalid-id"}`,
      );
    }
    lines.push("", "Nothing was written. Re-run with --commit to import.");
  }

  if (outcome.created.length > 0) {
    lines.push("", "created:");
    for (const row of outcome.created) lines.push(`  line ${row.line}: ${row.customerId}`);
  }
  if (outcome.replayed.length > 0) {
    lines.push("", "already imported by this batch (replayed, not duplicated):");
    for (const row of outcome.replayed) lines.push(`  line ${row.line}: ${row.customerId}`);
  }
  if (outcome.failed.length > 0) {
    lines.push("", "FAILED — these rows were not created:");
    for (const row of outcome.failed) {
      lines.push(`  line ${row.line}: ${row.code} — ${row.message}`);
    }
    lines.push(
      "",
      "Rows above this point were created and are listed. Re-running the same file",
      "replays them rather than duplicating them.",
    );
  }

  return lines.join("\n");
}
