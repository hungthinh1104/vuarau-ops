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
          Ghi đơn hàng và thanh toán, xem công nợ từng khách.
        </p>
      </header>

      <Link
        href="/customers"
        className="touch-target inline-flex items-center justify-center rounded-button bg-leaf px-4 text-label font-semibold text-white hover:bg-leaf-hover"
      >
        Khách hàng
      </Link>

      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="text-subheading font-semibold">Chưa có</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-body-sm text-ink-muted">
          <li>Hoàn tác thanh toán và hoàn tác đơn hàng</li>
          <li>Điều chỉnh công nợ bằng tay</li>
          <li>Làm việc khi mất mạng</li>
          <li>Gợi ý mặt hàng và giá lần trước</li>
        </ul>
      </section>

      {/* Fixture data, not a depot's books. Kept for design review and marked
          plainly, because the one thing that must not happen is somebody reading
          a sample balance as a real one. */}
      <Link href="/demo" className="text-body-sm text-ink-muted underline underline-offset-2">
        Bản dựng thử giao diện (dữ liệu mẫu)
      </Link>
    </main>
  );
}
