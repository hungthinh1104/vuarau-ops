import { and, eq } from "drizzle-orm";
import type { QualityGradeId, WorkspaceId } from "@vuarau/domain-contracts";
import type { QualityGradeState } from "@vuarau/domain-kernel";
import { qualityGrades } from "../../schema/index.ts";
import { fromIso, toIso } from "../row-mappers.ts";
import type { Tx } from "../shared/types.ts";

const state = (row: typeof qualityGrades.$inferSelect): QualityGradeState => ({
  id: row.id as QualityGradeId,
  workspaceId: row.workspaceId as WorkspaceId,
  name: row.name,
  sortOrder: row.sortOrder,
  isActive: row.isActive,
  version: row.version,
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});

export const createQualityGradeWriteRepositories = (tx: Tx) => ({
  qualityGrades: {
    async findById(workspaceId: WorkspaceId, qualityGradeId: QualityGradeId) {
      const rows = await tx
        .select()
        .from(qualityGrades)
        .where(
          and(eq(qualityGrades.workspaceId, workspaceId), eq(qualityGrades.id, qualityGradeId)),
        )
        .limit(1);
      return rows[0] === undefined ? null : state(rows[0]);
    },
    async findByIdForUpdate(workspaceId: WorkspaceId, qualityGradeId: QualityGradeId) {
      const rows = await tx
        .select()
        .from(qualityGrades)
        .where(
          and(eq(qualityGrades.workspaceId, workspaceId), eq(qualityGrades.id, qualityGradeId)),
        )
        .limit(1)
        .for("update");
      return rows[0] === undefined ? null : state(rows[0]);
    },
    async insert(grade: QualityGradeState) {
      await tx.insert(qualityGrades).values({
        id: grade.id,
        workspaceId: grade.workspaceId,
        name: grade.name,
        sortOrder: grade.sortOrder,
        isActive: grade.isActive,
        version: grade.version,
        createdAt: fromIso(grade.createdAt),
        updatedAt: fromIso(grade.updatedAt),
      });
    },
    async update(grade: QualityGradeState, expectedVersion: number) {
      const rows = await tx
        .update(qualityGrades)
        .set({
          name: grade.name,
          sortOrder: grade.sortOrder,
          isActive: grade.isActive,
          version: grade.version,
          updatedAt: fromIso(grade.updatedAt),
        })
        .where(
          and(
            eq(qualityGrades.workspaceId, grade.workspaceId),
            eq(qualityGrades.id, grade.id),
            eq(qualityGrades.version, expectedVersion),
          ),
        )
        .returning({ id: qualityGrades.id });
      return rows.length === 1;
    },
  },
});
