import { describe, expect, it } from "vitest";
import { WORKSPACE_ID } from "@vuarau/test-fixtures";
import { formatReport, parseCsv, readCustomerCsv, readProductCsv } from "./pilot-csv.ts";

/**
 * BR-CUSTOMER-005 / TC-CUSTOMER-010 — a customer import is judged whole, before
 * anything is written.
 *
 * The file is somebody's real customer list, typed once. Half of it imported is
 * worse than none of it: the facilitator cannot tell where it stopped, and
 * re-running it would create the good rows twice.
 */
describe("BR-CUSTOMER-005 / TC-CUSTOMER-010 — reading a customer CSV", () => {
  const header = "ten,dien_thoai,ghi_chu\n";

  it("reads a Vietnamese header, a BOM and CRLF, because that is what a spreadsheet emits", () => {
    const parsed = readCustomerCsv(
      `\ufefften,dien_thoai\r\nChị Lan chợ Bình Điền,0901234567\r\n`,
      WORKSPACE_ID,
    );

    expect(parsed.problems).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.displayName).toBe("Chị Lan chợ Bình Điền");
    expect(parsed.rows[0]?.phone).toBe("0901234567");
  });

  it("reads an English header just as well", () => {
    const parsed = readCustomerCsv(
      "name,phone,note\nCô Bảy,0912345678,vựa Hóc Môn\n",
      WORKSPACE_ID,
    );
    expect(parsed.rows[0]?.note).toBe("vựa Hóc Môn");
  });

  it("keeps a comma inside a quoted field", () => {
    expect(parseCsv('a,b\n"Vựa Ba Hưng, chợ Bình Điền",0901\n')[1]).toEqual([
      "Vựa Ba Hưng, chợ Bình Điền",
      "0901",
    ]);
  });

  it("names the line and the column of every bad row, and yields no rows for them", () => {
    const parsed = readCustomerCsv(
      `${header}Chị Lan,0901,\n,0902,thiếu tên\n${"x".repeat(201)},0903,\n`,
      WORKSPACE_ID,
    );

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.problems).toEqual([
      { line: 3, column: "name", problem: "Thiếu tên khách hàng." },
      { line: 4, column: "name", problem: "Tên dài quá 200 ký tự." },
    ]);
    expect(parsed.inputRows).toBe(parsed.rows.length + parsed.problems.length);
  });

  it("refuses a file with no name column rather than guessing which one it is", () => {
    const parsed = readCustomerCsv("so_dien_thoai,ghi_chu\n0901,x\n", WORKSPACE_ID);
    expect(parsed.rows).toEqual([]);
    expect(parsed.problems[0]?.column).toBe("header");
  });

  it("warns about a duplicate name without refusing it", () => {
    // Two customers may genuinely share a name (ASM-012). Blocking the import
    // would be deciding that policy in a script.
    const parsed = readCustomerCsv(`${header}Chị Lan,0901,\nchị lan,0902,\n`, WORKSPACE_ID);

    expect(parsed.problems).toEqual([]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0]?.line).toBe(3);
  });

  it("blanks an empty phone and note to null rather than to an empty string", () => {
    const parsed = readCustomerCsv(`${header}Anh Tuấn,,\n`, WORKSPACE_ID);
    expect(parsed.rows[0]?.phone).toBeNull();
    expect(parsed.rows[0]?.note).toBeNull();
  });
});

/**
 * TC-CUSTOMER-011 — the same file produces the same ids and the same idempotency
 * keys, every time.
 *
 * This is what makes a re-run after a crash a **replay** rather than a second set
 * of customers (BR-COMMAND-001). A replay also requires the payload to match, so
 * the customer id has to be derived too: a fresh uuid under the same key is a
 * rejection, not a replay.
 */
describe("BR-CUSTOMER-005 / TC-CUSTOMER-011 — import identity", () => {
  const file = "ten,dien_thoai\nChị Lan,0901\nCô Bảy,0902\n";

  it("derives the same ids and keys from the same file", () => {
    const first = readCustomerCsv(file, WORKSPACE_ID);
    const second = readCustomerCsv(file, WORKSPACE_ID);

    expect(second.batchId).toBe(first.batchId);
    expect(second.rows.map((row) => row.customerId)).toEqual(
      first.rows.map((row) => row.customerId),
    );
    expect(second.rows.map((row) => row.idempotencyKey)).toEqual(
      first.rows.map((row) => row.idempotencyKey),
    );
    expect(second.rows.map((row) => row.commandId)).toEqual(first.rows.map((row) => row.commandId));
  });

  it("gives a different file different keys, so two imports cannot collide", () => {
    const other = readCustomerCsv("ten,dien_thoai\nAnh Tuấn,0903\n", WORKSPACE_ID);
    const original = readCustomerCsv(file, WORKSPACE_ID);
    expect(other.batchId).not.toBe(original.batchId);
    expect(other.rows[0]?.idempotencyKey).not.toBe(original.rows[0]?.idempotencyKey);
  });

  it("mints ids that are valid uuids, since the schema will check them", () => {
    for (const row of readCustomerCsv(file, WORKSPACE_ID).rows) {
      expect(row.customerId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-/);
    }
  });

  it("scopes ids to the depot, so the same list imported twice cannot collide", () => {
    const here = readCustomerCsv(file, WORKSPACE_ID);
    const elsewhere = readCustomerCsv(file, "00000000-0000-4000-8000-0000000000a2");
    expect(elsewhere.rows[0]?.customerId).not.toBe(here.rows[0]?.customerId);
  });

  it("reports a dry run as having written nothing, in those words", () => {
    const report = formatReport(readCustomerCsv(file, WORKSPACE_ID), {
      mode: "dry-run",
      created: [],
      replayed: [],
      failed: [],
    });
    expect(report).toContain("Nothing was written");
    expect(report).toContain("would create:");
    expect(report).toContain("Chị Lan");
  });

  it("says which rows exist when a commit stopped part-way", () => {
    // Not silent, and not pretended away: the report names what was created, so a
    // facilitator can see the state rather than infer it.
    const report = formatReport(readCustomerCsv(file, WORKSPACE_ID), {
      mode: "commit",
      created: [{ line: 2, customerId: "c-1" }],
      replayed: [],
      failed: [{ line: 3, code: "CUSTOMER_NAME_REQUIRED", message: "Thiếu tên." }],
    });
    expect(report).toContain("created:");
    expect(report).toContain("FAILED");
    expect(report).toContain("line 3: CUSTOMER_NAME_REQUIRED");
  });
});

describe("M23 — deterministic Product onboarding", () => {
  const file = "ten,ten_khac,don_vi\nCà chua,cà bi|tomato,kg\nRau muống,rau muon,bo\n";

  it("validates Product rows using the command vocabulary", () => {
    const parsed = readProductCsv(file, WORKSPACE_ID);
    expect(parsed.problems).toEqual([]);
    expect(parsed.inputRows).toBe(2);
    expect(parsed.rows).toMatchObject([
      { displayName: "Cà chua", aliases: ["cà bi", "tomato"], preferredUnit: "kg" },
      { displayName: "Rau muống", aliases: ["rau muon"], preferredUnit: "bo" },
    ]);
  });

  it("rejects invalid rows without hiding accepted rows", () => {
    const parsed = readProductCsv("ten,don_vi\nCà chua,kg\n,kg\nỚt,bao\n", WORKSPACE_ID);
    expect(parsed.inputRows).toBe(3);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.problems).toHaveLength(2);
    expect(parsed.inputRows).toBe(parsed.rows.length + parsed.problems.length);
  });

  it("keeps command, Product and idempotency identity stable and workspace scoped", () => {
    const first = readProductCsv(file, WORKSPACE_ID);
    const replay = readProductCsv(file, WORKSPACE_ID);
    const foreign = readProductCsv(file, "00000000-0000-4000-8000-0000000000a2");
    expect(replay.rows).toEqual(first.rows);
    expect(foreign.rows[0]?.productId).not.toBe(first.rows[0]?.productId);
    expect(foreign.rows[0]?.commandId).not.toBe(first.rows[0]?.commandId);
  });
});
