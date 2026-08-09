import { DisclosureSection } from "@/ui/patterns/layout/page-layout.tsx";

export type ReferenceDisclosureItem = {
  readonly label: string;
  readonly value: string;
};

/** Keeps machine references available for support without making them the primary record identity. */
export function ReferenceDisclosure({
  items,
}: {
  readonly items: readonly ReferenceDisclosureItem[];
}) {
  if (items.length === 0) return null;

  return (
    <DisclosureSection
      title="Thông tin tra cứu"
      description="Mở phần này khi cần đối chiếu với bộ phận hỗ trợ hoặc chứng từ gốc."
    >
      <dl className="grid gap-2 text-body-sm sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-caption text-ink-muted">{item.label}</dt>
            <dd className="break-all text-caption text-ink">{item.value}</dd>
          </div>
        ))}
      </dl>
    </DisclosureSection>
  );
}
