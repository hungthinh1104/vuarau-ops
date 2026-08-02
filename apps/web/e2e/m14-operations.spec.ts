import { expect, test, signIn } from "./harness/signed-in.ts";

test.describe("M14 — owner operations", () => {
  test("shows integrity and exports a checksummed secret-free backup", async ({ page }) => {
    await signIn(page, "owner");
    await page.goto("/workspace/operations");
    await expect(page.getByRole("heading", { name: "Vận hành hệ thống" })).toBeVisible();
    await expect(page.getByText(/tài khoản tốt/)).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Xuất bản sao lưu" }).click();
    const file = await (await download).createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of file) chunks.push(Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString("utf8");
    const backup = JSON.parse(text) as { version: number; digest: string };
    expect(backup.version).toBe(7);
    expect(backup.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(text).not.toMatch(/SUPABASE|bearer|password|jwt/i);
  });
});
