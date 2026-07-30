import type { Repositories } from "../../ports.ts";
import { key } from "../store.ts";
import type { Store } from "../store.ts";

export const createQualityGradeRepositories = (
  store: Store,
): Pick<Repositories, "qualityGrades"> => ({
  qualityGrades: {
    findById: async (workspaceId, qualityGradeId) =>
      store.qualityGrades.get(key(workspaceId, qualityGradeId)) ?? null,
    findByIdForUpdate: async (workspaceId, qualityGradeId) =>
      store.qualityGrades.get(key(workspaceId, qualityGradeId)) ?? null,
    insert: async (grade) => {
      store.qualityGrades.set(key(grade.workspaceId, grade.id), grade);
    },
    update: async (grade, expectedVersion) => {
      const current = store.qualityGrades.get(key(grade.workspaceId, grade.id));
      if (current === undefined || current.version !== expectedVersion) return false;
      store.qualityGrades.set(key(grade.workspaceId, grade.id), grade);
      return true;
    },
  },
});
