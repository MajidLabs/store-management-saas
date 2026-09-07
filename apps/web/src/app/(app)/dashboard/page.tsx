"use client";

import Link from "next/link";
import { useMyStore, useSubscription } from "@/hooks/use-store";
import { useProducts } from "@/hooks/use-products";
import { useOrders } from "@/hooks/use-orders";
import { PageHeader } from "@/components/layout/page-header";
import { Card, Badge, Money, PageSpinner } from "@/components/ui/primitives";
import { RoleGuard } from "@/components/layout/role-guard";
import { statusTone } from "@/lib/order-status";

export default function DashboardPage() {
  return (
    <RoleGuard allow={["STORE_OWNER", "STAFF"]}>
      <DashboardContent />
    </RoleGuard>
  );
}

function DashboardContent() {
  const { data: store, isLoading: storeLoading } = useMyStore();
  const { data: subscription } = useSubscription();
  const { data: products } = useProducts({ limit: 1 });
  const { data: pendingOrders } = useOrders({ status: "PENDING", limit: 1 });
  const { data: recentOrders } = useOrders({ limit: 5 });

  if (storeLoading) return <PageSpinner />;

  return (
    <div>
      <PageHeader title={store?.name ?? "Dashboard"} description="Here's how your store is doing." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Products" value={products?.meta.total ?? 0} />
        <StatCard label="Pending orders" value={pendingOrders?.meta.total ?? 0} />
        <StatCard
          label="Plan"
          value={subscription?.plan ?? "-"}
          hint={subscription?.plan === "FREE" ? "Upgrade in Billing for more staff seats" : undefined}
        />
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink">Recent orders</h2>
          <Link href="/orders" className="text-sm font-medium text-accent hover:underline">
            View all
          </Link>
        </div>

        {!recentOrders || recentOrders.data.length === 0 ? (
          <Card className="px-4 py-8 text-center text-sm text-ink-muted">
            No orders yet. Create one from the Orders page.
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {recentOrders.data.map((order) => (
                <li key={order.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="font-mono text-sm text-ink">{order.id.slice(0, 8)}</p>
                    <p className="text-xs text-ink-muted">
                      {order.items.length} item{order.items.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={statusTone(order.status)}>{order.status}</Badge>
                    <Money value={order.total} className="text-sm text-ink" />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </Card>
  );
}
