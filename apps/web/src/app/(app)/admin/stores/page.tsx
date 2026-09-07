"use client";

import { useState } from "react";
import { useAdminStores, useSetStoreSuspended } from "@/hooks/use-store";
import { PageHeader } from "@/components/layout/page-header";
import { RoleGuard } from "@/components/layout/role-guard";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { Badge, PageSpinner } from "@/components/ui/primitives";

export default function AdminStoresPage() {
  return (
    <RoleGuard allow={["SUPER_ADMIN"]}>
      <AdminStoresContent />
    </RoleGuard>
  );
}

function AdminStoresContent() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAdminStores({ page });
  const setSuspended = useSetStoreSuspended();

  async function handleToggle(id: string, currentlySuspended: boolean, name: string) {
    const action = currentlySuspended ? "reactivate" : "suspend";
    if (!confirm(`Are you sure you want to ${action} "${name}"?`)) return;
    await setSuspended.mutateAsync({ id, suspended: !currentlySuspended });
  }

  if (isLoading) return <PageSpinner />;

  return (
    <div>
      <PageHeader title="All stores" description="Platform-wide view across every tenant." />

      <Table>
        <Thead>
          <Tr>
            <Th>Store</Th>
            <Th>Plan</Th>
            <Th>Status</Th>
            <Th>Created</Th>
            <Th></Th>
          </Tr>
        </Thead>
        <Tbody>
          {data?.data.map((store) => (
            <Tr key={store.id}>
              <Td className="font-medium text-ink">{store.name}</Td>
              <Td>
                <Badge tone={store.subscription?.plan === "PRO" ? "accent" : "neutral"}>
                  {store.subscription?.plan ?? "-"}
                </Badge>
              </Td>
              <Td>
                {store.isSuspended ? (
                  <Badge tone="danger">Suspended</Badge>
                ) : (
                  <Badge tone="accent">Active</Badge>
                )}
              </Td>
              <Td className="text-ink-muted">{new Date(store.createdAt).toLocaleDateString()}</Td>
              <Td className="text-right">
                <button
                  onClick={() => handleToggle(store.id, store.isSuspended, store.name)}
                  className={`text-xs font-medium ${
                    store.isSuspended
                      ? "text-accent hover:underline"
                      : "text-ink-muted hover:text-danger"
                  }`}
                >
                  {store.isSuspended ? "Reactivate" : "Suspend"}
                </button>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
      {data && <Pagination meta={data.meta} onPageChange={setPage} />}
    </div>
  );
}
