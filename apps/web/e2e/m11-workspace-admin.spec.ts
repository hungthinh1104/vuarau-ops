import { expect, signIn, signInActor, test } from "./harness/signed-in.ts";
import { api } from "./harness/api.ts";

test.describe("TC-E2E-024 — M11 workspace administration", () => {
  test("an owner adds, changes and revokes a member; permissions change on the next request", async ({
    page,
  }) => {
    const memberName = `E2E thành viên ${crypto.randomUUID().slice(0, 8)}`;
    const actorId = await api.createUnassignedActor(memberName);

    await signIn(page, "owner");
    await page.goto("/workspace");
    await expect(page.getByRole("heading", { name: "Vựa rau Bình Điền" })).toBeVisible();

    const addForm = page.locator("section").filter({ hasText: "Thêm tài khoản đã có" });
    await addForm.getByLabel("Mã tài khoản").fill(actorId);
    await addForm.getByLabel("Vai trò").selectOption("sales");
    await addForm.getByRole("button", { name: "Thêm thành viên" }).click();
    await expect(page.getByText(memberName, { exact: true })).toBeVisible();

    const member = page.locator("article").filter({ hasText: memberName });
    await member.getByLabel("Vai trò").selectOption("accountant");
    await member.getByRole("button", { name: "Đổi vai trò" }).click();
    await expect(member.getByRole("status").getByText("Đã ghi nhận")).toBeVisible();

    const memberPage = await page.context().newPage();
    await signInActor(memberPage, actorId);
    await memberPage.goto("/customers");
    await expect(memberPage.getByRole("heading", { name: "Khách hàng" })).toBeVisible();
    await expect(memberPage.getByRole("link", { name: "Quản lý vựa" })).toHaveCount(0);

    await member.getByRole("button", { name: "Thu hồi" }).click();
    await expect(member.getByText("Đã thu hồi", { exact: true })).toBeVisible();
    await memberPage.reload();
    await expect(
      memberPage.getByText("Tài khoản chưa được thêm vào vựa nào", { exact: true }),
    ).toBeVisible();
  });
});
