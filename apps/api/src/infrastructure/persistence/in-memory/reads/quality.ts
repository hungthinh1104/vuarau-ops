import type { Repositories } from "../../ports.ts";
import { fold, key, takePage } from "../store.ts";
import type { Store } from "../store.ts";

const sortValue = (row: { sortOrder: number; name: string }) => `${row.sortOrder}:${row.name}`;

export const createQualityGradeReads = (store: Store): Pick<Repositories, "qualityGradeReads"> => ({
  qualityGradeReads: {
    list: async ({ workspaceId, query, isActive, page }) => {
      const needle = fold(query);
      const rows = [...store.qualityGrades.values()]
        .filter((grade) => grade.workspaceId === workspaceId)
        .filter((grade) => isActive === null || grade.isActive === isActive)
        .filter((grade) => needle.length === 0 || fold(grade.name).includes(needle))
        .sort(
          (left, right) =>
            left.sortOrder - right.sortOrder ||
            left.name.localeCompare(right.name) ||
            left.id.localeCompare(right.id),
        )
        .filter((grade) => {
          if (page.after === null) return true;
          const separator = page.after.sortValue.indexOf(":");
          const cursorOrder = Number(page.after.sortValue.slice(0, separator));
          const cursorName = page.after.sortValue.slice(separator + 1);
          return (
            grade.sortOrder > cursorOrder ||
            (grade.sortOrder === cursorOrder &&
              (grade.name.localeCompare(cursorName) > 0 ||
                (grade.name === cursorName && grade.id > page.after.id)))
          );
        });
      return takePage(
        rows.map((grade) => ({ ...grade })),
        page,
        (grade) => ({ sortValue: sortValue(grade), id: grade.id }),
      );
    },
    get: async (workspaceId, qualityGradeId) => {
      const grade = store.qualityGrades.get(key(workspaceId, qualityGradeId));
      return grade === undefined ? null : { ...grade };
    },
  },
});
