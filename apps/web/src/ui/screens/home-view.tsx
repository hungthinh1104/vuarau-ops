import Link from "next/link";
import { LinkButton } from "@/ui/primitives/link-button.tsx";

/** The public entry screen; it describes the currently available workflow. */
export function HomeView() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <header>
        <h1 className="text-heading font-bold">Vựa Rau — sổ vựa</h1>
        <p className="mt-2 text-body text-ink-muted">
          Ghi đơn hàng và thanh toán, xem công nợ từng khách.
        </p>
      </header>

      <LinkButton href="/customers">Khách hàng</LinkButton>

      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="text-subheading font-semibold">Các luồng vận hành</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-body-sm text-ink-muted">
          <li>Bán hàng, thanh toán và theo dõi công nợ khách.</li>
          <li>Mua hàng, nhận hàng, kiểm định và quản lý tồn kho.</li>
          <li>Giao hàng, hàng trả, báo cáo và khôi phục dữ liệu.</li>
          <li>Làm việc khi mất mạng với hàng đợi đồng bộ an toàn.</li>
        </ul>
      </section>

      <Link href="/demo" className="text-body-sm text-ink-muted underline underline-offset-2">
        Bản dựng thử giao diện (dữ liệu mẫu)
      </Link>
    </main>
  );
}
