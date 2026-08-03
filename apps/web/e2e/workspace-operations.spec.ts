import { expect, test, signIn } from "./harness/signed-in.ts";
import { workspaceBackupV15Schema } from "@vuarau/domain-contracts";

test.describe("Owner workspace operations", () => {
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
    const parsedBackup = workspaceBackupV15Schema.safeParse(JSON.parse(text));
    expect(parsedBackup.success).toBe(true);
    if (!parsedBackup.success) throw new Error(parsedBackup.error.message);
    expect(parsedBackup.data.version).toBe(15);
    expect(parsedBackup.data.payload.priceRules).toBeDefined();
    expect(parsedBackup.data.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(text).not.toMatch(/SUPABASE|bearer|password|jwt/i);
  });
});
