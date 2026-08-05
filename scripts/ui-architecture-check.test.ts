import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { checkUiArchitecture } from "./ui-architecture-check.ts";

async function checkFixture(files: Readonly<Record<string, string>>) {
  const root = await mkdtemp(join(tmpdir(), "vuarau-ui-architecture-"));
  try {
    for (const [path, source] of Object.entries(files)) {
      const absolutePath = join(root, path);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, source);
    }
    return await checkUiArchitecture(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("rejects a route that owns markup or imports primitives", async () => {
  const result = await checkFixture({
    "apps/web/src/app/(app)/customers/page.tsx":
      'import { Button } from "@/ui/primitives/button.tsx"; export default function Page() { return <div><Button /></div>; }',
  });
  assert.deepEqual(result.failures, [
    "apps/web/src/app/(app)/customers/page.tsx: route owns visual markup; render a screen",
    "apps/web/src/app/(app)/customers/page.tsx: route bypasses controller/screen with a UI layer import",
    "apps/web/src/app/(app)/customers/page.tsx: route must delegate to a controller",
  ]);
});

test("rejects a route that renders a screen directly without a controller", async () => {
  const result = await checkFixture({
    "apps/web/src/app/(app)/customers/page.tsx":
      'import { CustomersView } from "@/ui/screens/customers-view.tsx"; export default function Page() { return <CustomersView />; }',
  });
  assert.deepEqual(result.failures, [
    "apps/web/src/app/(app)/customers/page.tsx: route must delegate to a controller",
  ]);
});

test("rejects a client boundary on a route wrapper", async () => {
  const result = await checkFixture({
    "apps/web/src/app/(app)/customers/page.tsx":
      '"use client";\nimport { CustomersController } from "@/ui/controllers/customers-controller.ts"; export default function Page() { return <CustomersController />; }',
  });
  assert.deepEqual(result.failures, [
    "apps/web/src/app/(app)/customers/page.tsx: route wrapper must stay server-rendered; keep the client boundary in the controller",
  ]);
});

test("rejects infrastructure imports from patterns and screens", async () => {
  const result = await checkFixture({
    "apps/web/src/ui/patterns/customer/customer-form.tsx":
      'import { useTRPC } from "@/api/providers.tsx"; export function CustomerForm() { return null; }',
    "apps/web/src/ui/screens/customer-view.tsx":
      'import { useOffline } from "@/offline/provider.tsx"; export function CustomerView() { return null; }',
  });
  assert.deepEqual(result.failures, [
    "apps/web/src/ui/patterns/customer/customer-form.tsx: pattern imports application infrastructure; move orchestration to a controller",
    "apps/web/src/ui/screens/customer-view.tsx: screen imports application infrastructure",
  ]);
});

test("rejects native controls in screens", async () => {
  const result = await checkFixture({
    "apps/web/src/ui/screens/customer-view.tsx":
      'export function CustomerView() { return <input aria-label="Tên" />; }',
  });
  assert.deepEqual(result.failures, [
    "apps/web/src/ui/screens/customer-view.tsx: screen contains a native control; use a ui/primitives control",
  ]);
});

test("rejects native controls in patterns", async () => {
  const result = await checkFixture({
    "apps/web/src/ui/patterns/customer/customer-form.tsx":
      'export function CustomerForm() { return <input aria-label="Tên" />; }',
  });
  assert.deepEqual(result.failures, [
    "apps/web/src/ui/patterns/customer/customer-form.tsx: pattern contains a native control; use a ui/primitives control",
  ]);
});

test("rejects button pill geometry on data containers", async () => {
  const result = await checkFixture({
    "apps/web/src/ui/patterns/intake/history.tsx":
      'export function History() { return <details className="rounded-button"><summary>Chi tiết</summary></details>; }',
  });
  assert.deepEqual(result.failures, [
    "apps/web/src/ui/patterns/intake/history.tsx: data container uses the button pill radius; use rounded-card or rounded-input",
  ]);
});

test("rejects visual styling that bypasses the shared design tokens", async () => {
  const result = await checkFixture({
    "apps/web/src/ui/screens/customer-view.tsx":
      'export function CustomerView() { return <section className="font-mono bg-[#fff]">Khách hàng</section>; }',
  });
  assert.deepEqual(result.failures, [
    "apps/web/src/ui/screens/customer-view.tsx: visual styling bypasses the shared design tokens; use the Be Vietnam Pro type and semantic color/radius tokens",
  ]);
});

test("rejects workspace knowledge in primitives and visual JSX in controllers", async () => {
  const result = await checkFixture({
    "apps/web/src/ui/primitives/money.ts":
      'import type { Money } from "@vuarau/domain-contracts"; export type Value = Money;',
    "apps/web/src/ui/controllers/customer-controller.tsx":
      'export function CustomerController() { return <div className="p-4" />; }',
  });
  assert.deepEqual(result.failures, [
    "apps/web/src/ui/controllers/customer-controller.tsx: controller contains visual composition",
    "apps/web/src/ui/primitives/money.ts: primitive imports a workspace package",
  ]);
});

test("rejects command contract escapes in controllers", async () => {
  const result = await checkFixture({
    "apps/web/src/ui/controllers/customer-controller.tsx":
      "export function CustomerController() { return send(command as never); }",
  });
  assert.deepEqual(result.failures, [
    "apps/web/src/ui/controllers/customer-controller.tsx: controller bypasses the command contract with as never",
  ]);
});

test("rejects engineering vocabulary and raw domain enums in rendered UI", async () => {
  const result = await checkFixture({
    "apps/web/src/ui/screens/customer-view.tsx":
      "export function CustomerView({ row }: { row: { reasonCode: string } }) { return <section><p>Policy unavailable</p><span>{row.reasonCode}</span></section>; }",
  });
  assert.deepEqual(result.failures, [
    'apps/web/src/ui/screens/customer-view.tsx: visible copy contains forbidden engineering term "policy"',
    "apps/web/src/ui/screens/customer-view.tsx: renders a raw domain enum; use the authoritative UI copy registry",
  ]);
});

test("rejects engineering vocabulary in controller feedback copy", async () => {
  const result = await checkFixture({
    "apps/web/src/ui/controllers/intake-controller.tsx":
      'export const feedback = { attemptedAction: "Hoàn tác kiểm định" };',
  });
  assert.deepEqual(result.failures, [
    'apps/web/src/ui/controllers/intake-controller.tsx: visible copy contains forbidden engineering term "kiểm định"',
  ]);
});

test("accepts translated status and reason copy", async () => {
  const result = await checkFixture({
    "apps/web/src/app/(app)/customers/page.tsx":
      'import { CustomersController } from "@/ui/controllers/customers-controller.ts"; export default function Page() { return <CustomersController />; }',
    "apps/web/src/ui/controllers/customers-controller.ts":
      "export function CustomersController() { return null; }",
    "apps/web/src/ui/screens/customers-view.tsx":
      "export function CustomersView() { return <section><span>Đang giao</span><p>Đã đối chiếu</p></section>; }",
  });
  assert.deepEqual(result.failures, []);
});

test("accepts the intended direction", async () => {
  const result = await checkFixture({
    "apps/web/src/app/(app)/customers/page.tsx":
      'import { CustomersController } from "@/ui/controllers/customers-controller.ts"; export default function Page() { return <CustomersController />; }',
    "apps/web/src/ui/controllers/customers-controller.ts":
      "export function CustomersController() { return null; }",
    "apps/web/src/ui/screens/customers-view.tsx":
      'import { Button } from "@/ui/primitives/button.tsx"; export function CustomersView() { return <Button>Thêm khách</Button>; }',
    "apps/web/src/ui/primitives/button.tsx":
      'export function Button() { return <button type="button" />; }',
  });
  assert.deepEqual(result.failures, []);
  assert.equal(result.checked, 4);
});
