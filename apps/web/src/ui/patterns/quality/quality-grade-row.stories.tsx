import type { Meta, StoryObj } from "@storybook/react-vite";
import type { QualityGradeDto } from "@vuarau/domain-contracts";
import { QUALITY_GRADE_1_ID, WORKSPACE_ID } from "@vuarau/test-fixtures/ids";
import { RECORDED_AT } from "@vuarau/test-fixtures/time";
import { QualityGradeRow } from "./quality-grade-row.tsx";

const activeGrade: QualityGradeDto = {
  id: QUALITY_GRADE_1_ID,
  workspaceId: WORKSPACE_ID,
  name: "Loại 1",
  sortOrder: 10,
  isActive: true,
  version: 3,
  createdAt: RECORDED_AT,
  updatedAt: RECORDED_AT,
};

const meta = {
  title: "Goods/QualityGrade/Management row",
  component: QualityGradeRow,
  args: {
    grade: activeGrade,
    mayManage: true,
    onUpdate: async () => true,
    onLifecycle: async () => true,
  },
} satisfies Meta<typeof QualityGradeRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ActiveManageable: Story = {};
export const ReadOnly: Story = { args: { mayManage: false } };
export const Inactive: Story = { args: { grade: { ...activeGrade, isActive: false, version: 4 } } };
