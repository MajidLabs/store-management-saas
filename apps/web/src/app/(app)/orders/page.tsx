"use client";

import { Fragment, useState } from "react";
import { useOrders, useUpdateOrderStatus } from "@/hooks/use-orders";
import { useProducts } from "@/hooks/use-products";
import { Order, OrderStatus } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { RoleGuard } from "@/components/layout/role-guard";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { Badge, EmptyState, Money, PageSpinner } from "@/components/ui/primitives";
import { CreateOrderForm } from "@/components/orders/create-order-form";
import { statusTone } from "@/lib/order-status";

const STATUS_FILTERS: (OrderStatus | "")[] = ["", "PENDING", "COMPLETED", "CANCELLED"];

export default function OrdersPage() {
  return (
    <RoleGuard allow={["STORE_OWNER", "STAFF"]}>
      <OrdersContent />
    </RoleGuard>
  );
}

function OrdersContent() {
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const { data, isLoading } = useOrders({ status: status || undefined, page });
  const { data: products } = useProducts({ limit: 100 });
  const updateStatus = useUpdateOrderStatus();

  async function handleCancel(order: Order) {
    if (!confirm("Cancel this order? Its items will be restocked.")) return;
    await updateStatus.mutateAsync({ id: order.id, status: "CANCELLED" });
  }

  async function handleComplete(order: Order) {
    await updateStatus.mutateAsync({ id: order.id, status: "COMPLETED" });
  }

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Create orders and track fulfillment."
        action={<Button onClick={() => setIsCreating(true)}>New order</Button>}
      />

      <div className="mb-4 flex gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s || "all"}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              status === s ? "bg-accent text-white" : "bg-border/60 text-ink-muted hover:bg-border"
            }`}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          title="No orders found"
          description="Orders you create will show up here."
          action={<Button onClick={() => setIsCreating(true)}>New order</Button>}
        />
      ) : (
        <>
          <Table>
            <Thead>
              <Tr>
                <Th>Order</Th>
                <Th>Items</Th>
                <Th>Total</Th>
                <Th>Status</Th>
                <Th>Created</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {data.data.map((order) => (
                <Fragment key={order.id}>
                  <Tr>
                    <Td>
                      <button
                        onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                        className="font-mono text-xs text-ink hover:text-accent"
                      >
                        {order.id.slice(0, 8)}
                      </button>
                    </Td>
                    <Td className="text-ink-muted">{order.items.length}</Td>
                    <Td>
                      <Money value={order.total} />
                    </Td>
                    <Td>
                      <Badge tone={statusTone(order.status)}>{order.status}</Badge>
                    </Td>
                    <Td className="text-ink-muted">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </Td>
                    <Td className="text-right">
                      {order.status === "PENDING" && (
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => handleComplete(order)}
                            className="text-xs font-medium text-accent hover:underline"
                          >
                            Complete
                          </button>
                          <button
                            onClick={() => handleCancel(order)}
                            className="text-xs font-medium text-ink-muted hover:text-danger"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </Td>
                  </Tr>
                  {expandedId === order.id && (
                    <Tr className="hover:bg-transparent">
                      <Td colSpan={6} className="bg-bg/60">
                        <ul className="flex flex-col gap-1 py-1 text-xs text-ink-muted">
                          {order.items.map((item) => (
                            <li key={item.id} className="flex justify-between">
                              <span>
                                {item.quantity} &times; {item.productName}
                              </span>
                              <Money value={item.unitPrice * item.quantity} />
                            </li>
                          ))}
                        </ul>
                      </Td>
                    </Tr>
                  )}
                </Fragment>
              ))}
            </Tbody>
          </Table>
          <Pagination meta={data.meta} onPageChange={setPage} />
        </>
      )}

      <Modal isOpen={isCreating} onClose={() => setIsCreating(false)} title="New order">
        <CreateOrderForm products={products?.data ?? []} onSaved={() => setIsCreating(false)} />
      </Modal>
    </div>
  );
}
