"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { ProductDto, ProductId, Unit } from "@vuarau/domain-contracts";
import { UNIT_LABEL_VI, UNITS } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTRPC } from "../../../../api/providers.tsx";
import { useSession } from "../../../../api/session-gate.tsx";
import { useDebounced } from "../../../../api/use-debounced.ts";
import { useCommand } from "../../../../api/use-command.ts";
import { CommandOutcome } from "../../../../ui/patterns/command-outcome.tsx";
import { Button } from "../../../../ui/primitives/button.tsx";
import { Select } from "../../../../ui/primitives/select.tsx";
import { INPUT_CLASS } from "../../../../ui/primitives/field.tsx";

export default function NewProductPage() {
  const trpc = useTRPC();
  const { workspaceId } = useSession();
  const router = useRouter();
  const productId = useRef(crypto.randomUUID() as ProductId).current;
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [unit, setUnit] = useState<Unit | "">("");
  const duplicateQuery = useDebounced(name, 250);
  const candidates = useQuery(
    trpc.product.search.queryOptions({
      workspaceId,
      query: duplicateQuery,
      isActive: null,
      cursor: null,
      limit: 5,
    }),
  );
  const mutation = useMutation(trpc.product.create.mutationOptions());
  const command = useCommand<unknown, ProductDto>((envelope) =>
    mutation.mutateAsync(envelope as never),
  );
  useEffect(() => {
    if (command.result !== null) router.replace(`/products/${command.result.id}`);
  }, [command.result, router]);
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-heading font-bold">Thêm mặt hàng</h1>
      <label className="text-label">
        Tên mặt hàng
        <input
          className={INPUT_CLASS}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      {duplicateQuery.trim().length > 0 && (candidates.data?.items.length ?? 0) > 0 ? (
        <section className="rounded-card border border-warning/40 bg-warning-soft p-3">
          <h2 className="text-label font-semibold">Tên gần giống đã có</h2>
          <ul className="mt-2 flex flex-col gap-1 text-body-sm">
            {candidates.data?.items.map((product) => (
              <li key={product.id}>
                <Link href={`/products/${product.id}`} className="text-info underline">
                  {product.displayName}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-caption">
            Kiểm tra trước khi tạo. Hệ thống không tự gộp hai mặt hàng.
          </p>
        </section>
      ) : null}
      <label className="text-label">
        Tên gọi khác
        <input
          className={INPUT_CLASS}
          value={aliases}
          onChange={(event) => setAliases(event.target.value)}
          placeholder="Phân cách bằng dấu phẩy"
        />
      </label>
      <Select
        label="Đơn vị gợi ý"
        value={unit}
        onChange={(event) => setUnit(event.target.value as Unit | "")}
        placeholder="Không chọn"
        options={UNITS.map((value) => ({ value, label: UNIT_LABEL_VI[value] }))}
      />
      <Button
        disabled={name.trim().length === 0 || command.phase.kind === "sending"}
        onClick={() =>
          void command.submit({
            productId,
            displayName: name,
            aliases: aliases
              .split(",")
              .map((alias) => alias.trim())
              .filter(Boolean),
            preferredUnit: unit || null,
          })
        }
      >
        Tạo mặt hàng
      </Button>
      <CommandOutcome command={command} attemptedAction="Tạo mặt hàng" onReload={() => undefined} />
      <Link href="/products" className="text-info underline">
        ← Hủy
      </Link>
    </div>
  );
}
