"use client";

import { useSession } from "../../../api/session-gate.tsx";
import { LinkButton, PageHeader, Section } from "../../../ui/patterns/page-layout.tsx";
import { todayActionsFor } from "../../../ui/patterns/today-actions.ts";

export default function TodayPage() {
  const { session } = useSession();
  const actions = todayActionsFor(session.permissions);
  const primary = actions.filter((action) => action.area === "primary");
  const work = actions.filter((action) => action.area === "work");
  const more = actions.filter((action) => action.area === "more");

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Hôm nay"
        description="Bắt đầu từ công việc vai trò hiện tại được phép thực hiện. Không có số liệu ước đoán trên màn hình này."
      />

      {primary.map((action) => (
        <Section key={action.label} title={action.label} description={action.description}>
          <LinkButton href={action.href}>Bắt đầu</LinkButton>
        </Section>
      ))}

      <Section
        id="work"
        title="Công việc"
        description="Các lối vào dưới đây đến từ quyền server trả cho phiên hiện tại."
      >
        <ActionGrid actions={work} />
      </Section>

      <Section id="more" title="Thêm">
        <ActionGrid actions={more} />
      </Section>
    </div>
  );
}

function ActionGrid({ actions }: { readonly actions: ReturnType<typeof todayActionsFor> }) {
  if (actions.length === 0) {
    return (
      <p className="text-body-sm text-ink-muted">Không có công việc phù hợp với vai trò này.</p>
    );
  }
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {actions.map((action) => (
        <li key={action.label} className="rounded-card border border-border p-3">
          <h3 className="font-semibold">{action.label}</h3>
          <p className="mt-1 text-body-sm text-ink-muted">{action.description}</p>
          <div className="mt-3">
            <LinkButton href={action.href} secondary>
              Mở
            </LinkButton>
          </div>
        </li>
      ))}
    </ul>
  );
}
