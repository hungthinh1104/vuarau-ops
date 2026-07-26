import { expect, test, injectToken } from "./harness/signed-in.ts";
import { E2E_WORKSPACE_NAME } from "./harness/environment.ts";

/**
 * TC-E2E-021 — the depot list comes from the server, over the real stack.
 *
 * The picker used to be drawn from `NEXT_PUBLIC_WORKSPACES`, a build-time
 * variable, which meant these specs proved the browser could read its own
 * configuration. Now it is `session.workspaces` against real Postgres
 * (BR-AUTH-008), so what is asserted here is the property that actually matters:
 * a person sees the depots they are a member of, and nothing else.
 */
test.describe("TC-E2E-021 — workspace discovery", () => {
  test("shows the depot the actor is a member of, named by the server", async ({ page }) => {
    await injectToken(page, "sales");
    await page.goto("/customers");

    await expect(page.getByRole("heading", { name: "Chọn vựa" })).toBeVisible();
    // The name is in the database, not in any environment variable this build was
    // given. It could only have come from the API.
    await page.getByRole("button", { name: E2E_WORKSPACE_NAME }).click();

    await expect(page.getByRole("heading", { name: "Khách hàng" })).toBeVisible();
  });

  test("tells a signed-in account with no depot what to do about it", async ({ page }) => {
    // A real, seeded Supabase subject that resolves to a real actor with no
    // membership. `session.workspaces` answers successfully with an empty list,
    // and the screen has to say so rather than spin.
    await injectToken(page, "unassigned");
    await page.goto("/customers");

    await expect(page.getByText("Tài khoản chưa được thêm vào vựa nào")).toBeVisible();
    await expect(page.getByText(/Báo chủ vựa để được thêm vào/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Chọn vựa" })).toBeHidden();
  });

  test("shows no depot data at all without a token", async ({ page }) => {
    await page.goto("/customers");

    // This build has no Supabase project — that is the point of the bridge — so
    // the gate stops at "sign-in is not configured" rather than at the code form.
    // The form itself is covered in jsdom by TC-WEB-025; what matters here is
    // that a production route renders nothing of the depot without an identity
    // (BR-AUTH-001).
    await expect(page.getByText("Chưa cấu hình đăng nhập")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Khách hàng" })).toBeHidden();
    await expect(page.getByRole("heading", { name: "Chọn vựa" })).toBeHidden();
    // No password field, on any screen, ever.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });
});
