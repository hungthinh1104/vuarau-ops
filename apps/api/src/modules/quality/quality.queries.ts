import type {
  Page,
  QualityGradeDto,
  QualityGradeId,
  QualityGradeListInput,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import { err } from "@vuarau/domain-kernel";
import type { DomainResult } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runQuery, toPage, toPageQuery } from "../shared/read-pipeline.ts";

export function listQualityGrades(
  ctx: CommandContext,
  input: QualityGradeListInput,
): Promise<DomainResult<Page<QualityGradeDto>>> {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "quality.read",
    execute: async ({ repos }) =>
      toPage(
        await repos.qualityGradeReads.list({
          workspaceId: input.workspaceId,
          query: input.query,
          isActive: input.isActive,
          page: toPageQuery(input),
        }),
        (row) => row,
      ),
  });
}

export async function getQualityGrade(
  ctx: CommandContext,
  input: { workspaceId: WorkspaceId; qualityGradeId: QualityGradeId },
): Promise<DomainResult<QualityGradeDto>> {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "quality.read",
    execute: ({ repos }) => repos.qualityGradeReads.get(input.workspaceId, input.qualityGradeId),
  });
  if (!result.ok) return result;
  return result.value === null
    ? err("QUALITY_GRADE_NOT_FOUND", "No such quality grade in this workspace.")
    : { ok: true as const, value: result.value };
}
