"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createCustomerOrderDraftCommandSchema,
  customerOrderChannelSchema,
  type CustomerId,
  type CustomerOrderLineId,
  type CustomerOrderId,
} from "@vuarau/domain-contracts";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import type { CustomerOrderDraftLine } from "@/ui/domain/customer-order-form.ts";
import { CustomerOrderCreateView } from "@/ui/screens/customer-order-create-view.tsx";

const newLine = (): CustomerOrderDraftLine => ({
  lineId: crypto.randomUUID() as CustomerOrderLineId,
  productId: "",
  productName: "",
  quantity: "1",
  unit: "kg",
  price: "",
});

export function CustomerOrderCreateController() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const router = useRouter();
  const orderId = useRef(crypto.randomUUID() as CustomerOrderId).current;
  const [channel, setChannel] =
    useState<(typeof customerOrderChannelSchema)["_output"]>("account_customer");
  const [customerId, setCustomerId] = useState<CustomerId | "">("");
  const [lines, setLines] = useState<readonly CustomerOrderDraftLine[]>([newLine()]);
  const [note, setNote] = useState("");
  const [dueAt, setDueAt] = useState("");
  const customers = useQuery(
    trpc.customer.search.queryOptions({
      workspaceId,
      query: "",
      isActive: true,
      cursor: null,
      limit: 100,
    }),
  );
  const products = useQuery(
    trpc.product.search.queryOptions({
      workspaceId,
      query: "",
      isActive: true,
      cursor: null,
      limit: 100,
    }),
  );
  const mutation = useMutation(trpc.customerOrder.createDraft.mutationOptions());
  const command = useContractCommand(createCustomerOrderDraftCommandSchema, mutation.mutateAsync);
  const needsCustomer = channel === "account_customer" || channel === "contract_customer";
  const payloadLines = lines.map((line) => ({
    lineId: line.lineId,
    productId: line.productId === "" ? null : line.productId,
    productName: line.productName.trim(),
    quantity: { valueScaled: Math.round(Number(line.quantity) * 1000), unit: line.unit },
    agreedUnitPrice:
      line.price.trim() === ""
        ? null
        : { amountMinor: Math.round(Number(line.price) * 1000), currency: "VND" as const },
  }));
  const valid =
    (!needsCustomer || customerId !== "") &&
    payloadLines.length > 0 &&
    payloadLines.every(
      (line) =>
        line.productName.length > 0 &&
        line.quantity.valueScaled > 0 &&
        Number.isSafeInteger(line.quantity.valueScaled) &&
        (line.agreedUnitPrice === null ||
          (line.agreedUnitPrice.amountMinor >= 0 &&
            Number.isSafeInteger(line.agreedUnitPrice.amountMinor))),
    );

  async function save() {
    const result = await command.submit({
      customerOrderId: orderId,
      customerId: needsCustomer && customerId !== "" ? customerId : null,
      channel,
      currency: "VND",
      lines: payloadLines,
      note: note.trim() || null,
      paymentTermsSnapshot:
        dueAt.trim() === ""
          ? null
          : {
              label: `Hạn thanh toán ${dueAt}`,
              dueAt: new Date(`${dueAt}T23:59:59+07:00`).toISOString(),
            },
      evidenceReferences: [],
      replacesCustomerOrderId: null,
    });
    if (result !== null) router.replace(`/customer-orders/${result.id}`);
  }

  return (
    <CustomerOrderCreateView
      channel={channel}
      customerId={customerId}
      customers={(customers.data?.items ?? []).map((item) => ({
        id: item.id,
        displayName: item.displayName,
      }))}
      products={(products.data?.items ?? []).map((item) => ({
        id: item.id,
        displayName: item.displayName,
        preferredUnit: item.preferredUnit,
      }))}
      lines={lines}
      note={note}
      dueAt={dueAt}
      valid={valid}
      command={command}
      submitting={command.phase.kind === "sending"}
      canCreate={session.permissions.includes("customer_order.create")}
      onChannelChange={(value) => {
        const next = customerOrderChannelSchema.parse(value);
        setChannel(next);
        if (next === "walk_in" || next === "internal_transfer") setCustomerId("");
      }}
      onCustomerChange={(value) => setCustomerId(value as CustomerId | "")}
      onLineChange={(lineId, patch) =>
        setLines((current) =>
          current.map((line) => (line.lineId === lineId ? { ...line, ...patch } : line)),
        )
      }
      onAddLine={() => setLines((current) => [...current, newLine()])}
      onRemoveLine={(lineId) =>
        setLines((current) => current.filter((line) => line.lineId !== lineId))
      }
      onNoteChange={setNote}
      onDueAtChange={setDueAt}
      onSave={() => void save()}
      onCancel={() => router.push("/customer-orders")}
    />
  );
}
