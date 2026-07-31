import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Page, QualityGradeDto } from "@vuarau/domain-contracts";
import { QUALITY_GRADE_1_ID, WORKSPACE_ID } from "@vuarau/test-fixtures/ids";
import { RECORDED_AT } from "@vuarau/test-fixtures/time";
import { QualityGradeRow } from "@/ui/patterns/quality/quality-grade-row.tsx";
import { QualityGradesView } from "./quality-grades-view.tsx";

const grades: readonly QualityGradeDto[] = [
  {
    id: QUALITY_GRADE_1_ID,
    workspaceId: WORKSPACE_ID,
    name: "Loại 1",
    sortOrder: 10,
    isActive: true,
    version: 2,
    createdAt: RECORDED_AT,
    updatedAt: RECORDED_AT,
  },
  {
    id: "00000000-0000-4000-8000-0000000000b2" as QualityGradeDto["id"],
    workspaceId: WORKSPACE_ID,
    name: "Loại 2",
    sortOrder: 20,
    isActive: true,
    version: 1,
    createdAt: RECORDED_AT,
    updatedAt: RECORDED_AT,
  },
  {
    id: "00000000-0000-4000-8000-0000000000b3" as QualityGradeDto["id"],
    workspaceId: WORKSPACE_ID,
    name: "Dạt",
    sortOrder: 30,
    isActive: false,
    version: 4,
    createdAt: RECORDED_AT,
    updatedAt: RECORDED_AT,
  },
];

const page: Page<QualityGradeDto> = { items: grades, nextCursor: null };
const readyQuery = { isPending: false, isError: false, error: null, data: page } as const;

const meta = {
  title: "Screens/Goods/QualityGrades",
  component: QualityGradesView,
  args: {
    query: readyQuery,
    mayManage: true,
    search: "",
    activeFilter: "all",
    createName: "",
    createSortOrder: "40",
    renderGrade: (grade) => (
      <QualityGradeRow
        key={grade.id}
        grade={grade}
        mayManage
        onUpdate={async () => true}
        onLifecycle={async () => true}
      />
    ),
    onSearchChange: () => undefined,
    onFilterChange: () => undefined,
    onCreateNameChange: () => undefined,
    onCreateSortOrderChange: () => undefined,
    onCreate: () => undefined,
    onRetry: () => undefined,
  },
} satisfies Meta<typeof QualityGradesView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const MobileManagement: Story = { globals: { viewport: { value: "mobile" } } };
export const DesktopManagement: Story = { globals: { viewport: { value: "desktop" } } };
export const ReadOnly: Story = {
  args: {
    mayManage: false,
    renderGrade: (grade) => (
      <QualityGradeRow
        key={grade.id}
        grade={grade}
        mayManage={false}
        onUpdate={async () => false}
        onLifecycle={async () => false}
      />
    ),
  },
};
export const Loading: Story = {
  args: { query: { isPending: true, isError: false, error: null, data: undefined } },
};
export const Empty: Story = {
  args: { query: { ...readyQuery, data: { items: [], nextCursor: null } } },
};
export const NoSearchResult: Story = {
  args: {
    search: "hàng đặc biệt",
    query: { ...readyQuery, data: { items: [], nextCursor: null } },
  },
};
export const NetworkFailure: Story = {
  args: {
    query: { isPending: false, isError: true, error: new Error("offline"), data: undefined },
  },
};
