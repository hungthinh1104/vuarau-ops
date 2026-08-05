import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { QualityGradeDto } from "@vuarau/domain-contracts";
import { QUALITY_GRADE_1_ID, WORKSPACE_ID } from "@vuarau/test-fixtures/ids";
import { RECORDED_AT } from "@vuarau/test-fixtures/time";
import { QualityGradeRow } from "./quality-grade-row.tsx";

const grade: QualityGradeDto = {
  id: QUALITY_GRADE_1_ID,
  workspaceId: WORKSPACE_ID,
  name: "Loại 1",
  sortOrder: 10,
  isActive: true,
  version: 3,
  createdAt: RECORDED_AT,
  updatedAt: RECORDED_AT,
};

describe("QualityGradeRow", () => {
  it("is read-only when the actor lacks quality.manage", () => {
    render(
      <QualityGradeRow
        grade={grade}
        mayManage={false}
        onUpdate={async () => true}
        onLifecycle={async () => true}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Loại 1")).toBeInTheDocument();
  });

  it("updates name and sort order explicitly", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn(async () => true);
    render(
      <QualityGradeRow
        grade={grade}
        mayManage
        onUpdate={onUpdate}
        onLifecycle={async () => true}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Sửa" }));
    const name = screen.getByLabelText("Tên hạng hàng");
    await user.clear(name);
    await user.type(name, "Loại đặc biệt");
    const order = screen.getByLabelText("Thứ tự");
    await user.clear(order);
    await user.type(order, "25");
    await user.click(screen.getByRole("button", { name: "Cập nhật hạng hàng" }));

    expect(onUpdate).toHaveBeenCalledWith({ name: "Loại đặc biệt", sortOrder: 25 });
  });

  it("requires a human reason before deactivation", async () => {
    const user = userEvent.setup();
    const onLifecycle = vi.fn(async () => true);
    render(
      <QualityGradeRow
        grade={grade}
        mayManage
        onUpdate={async () => true}
        onLifecycle={onLifecycle}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ngưng hạng hàng" }));
    expect(screen.getByRole("button", { name: "Xác nhận ngưng" })).toBeDisabled();
    await user.type(screen.getByLabelText("Lý do ngưng"), "Không còn dùng cách phân loại này");
    await user.click(screen.getByRole("button", { name: "Xác nhận ngưng" }));

    expect(onLifecycle).toHaveBeenCalledWith({
      active: false,
      reason: "Không còn dùng cách phân loại này",
    });
  });
});
