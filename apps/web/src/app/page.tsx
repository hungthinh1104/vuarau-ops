import Link from "next/link";

/**
 * Deliberately not a dashboard.
 *
 * There is no production workflow yet — no customer search, no sale entry, no
 * payment capture — and a home page that implied otherwise would be the most
 * misleading screen in the repository. It says what exists and points at the two
 * things that do.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <header>
        <h1 className="text-heading font-bold">Vựa Rau — sổ vựa</h1>
        <p className="mt-2 text-body text-ink-muted">
          Nền tảng giao diện đang được dựng. Chưa có màn hình nghiệp vụ nào hoàn chỉnh.
        </p>
      </header>

      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="text-subheading font-semibold">Đang có</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-body-sm text-ink">
          <li>Bộ giao diện nền (primitives và patterns) theo design.md</li>
          <li>Storybook: mỗi trạng thái trong UI state catalog là một story</li>
          <li>Kết nối tRPC có kiểu, dùng chung hợp đồng với máy chủ</li>
        </ul>
      </section>

      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="text-subheading font-semibold">Chưa có</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-body-sm text-ink-muted">
          <li>Tìm khách hàng, tạo đơn, chốt đơn</li>
          <li>Ghi nhận và hoàn tác thanh toán</li>
          <li>Hoàn tác đơn hàng</li>
          <li>Làm việc offline</li>
        </ul>
      </section>

      <Link
        href="/demo"
        className="touch-target inline-flex items-center justify-center rounded-button bg-leaf px-4 text-label font-semibold text-white hover:bg-leaf-hover"
      >
        Xem bản dựng thử
      </Link>
    </main>
  );
}
