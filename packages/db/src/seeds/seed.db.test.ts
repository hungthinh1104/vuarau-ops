import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, skipWithoutDatabase, listMembers, type Database } from "@vuarau/db";
import type { WorkspaceId } from "@vuarau/domain-contracts";
import { customers, products, qualityGrades, suppliers, workspaces } from "../schema/index.ts";
import { seed } from "./seed.ts";

const DATABASE_URL = process.env["DATABASE_URL"];

describe.skipIf(skipWithoutDatabase())("development seed", () => {
  let database: Database;

  beforeAll(async () => {
    database = createDatabase(DATABASE_URL!, { max: 1 });
    await seed(DATABASE_URL!);
  });

  afterAll(async () => {
    await database.sql.end();
  });

  it("seeds every account role and membership edge case idempotently", async () => {
    const workspaceRows = await database.db
      .select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces);
    expect(workspaceRows).toEqual(
      expect.arrayContaining([
        { id: "11111111-1111-4111-8111-111111111111", name: "Vựa rau Bình Điền" },
        { id: "11111111-1111-4111-8111-111111111112", name: "Vựa rau Thủ Đức" },
      ]),
    );

    const mainMembers = await listMembers(
      database,
      "11111111-1111-4111-8111-111111111111" as WorkspaceId,
    );
    expect(mainMembers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "owner", isActive: true }),
        expect.objectContaining({ role: "accountant", isActive: true }),
        expect.objectContaining({ role: "sales", isActive: true }),
        expect.objectContaining({ role: "warehouse", isActive: true }),
        expect.objectContaining({ role: "delivery", isActive: true }),
        expect.objectContaining({ roles: ["accountant", "sales"], isActive: true }),
        expect.objectContaining({ role: "sales", isActive: false }),
        expect.objectContaining({ roles: ["accountant"], isActive: true }),
      ]),
    );

    const secondMembers = await listMembers(
      database,
      "11111111-1111-4111-8111-111111111112" as WorkspaceId,
    );
    expect(secondMembers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "owner", isActive: true }),
        expect.objectContaining({ role: "delivery", isActive: true }),
      ]),
    );

    const [customerRows, productRows, qualityGradeRows, supplierRows] = await Promise.all([
      database.db.select().from(customers),
      database.db.select().from(products),
      database.db.select().from(qualityGrades),
      database.db.select().from(suppliers),
    ]);
    expect(customerRows).toHaveLength(5);
    expect(customerRows.filter((row) => row.isActive)).toHaveLength(4);
    expect(productRows).toHaveLength(6);
    expect(qualityGradeRows).toHaveLength(3);
    expect(qualityGradeRows.filter((row) => row.isActive)).toHaveLength(2);
    expect(supplierRows).toHaveLength(2);

    await seed(DATABASE_URL!);
    expect(await database.db.select().from(customers)).toHaveLength(5);
    expect(await database.db.select().from(products)).toHaveLength(6);
  });
});
