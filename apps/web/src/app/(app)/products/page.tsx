"use client";

import { useState } from "react";
import Image from "next/image";
import { useProducts, useDeleteProduct } from "@/hooks/use-products";
import { useCategories } from "@/hooks/use-categories";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Product } from "@/lib/types";
import { API_BASE_URL } from "@/lib/api-client";
import { PageHeader } from "@/components/layout/page-header";
import { RoleGuard } from "@/components/layout/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { Badge, EmptyState, Money, PageSpinner } from "@/components/ui/primitives";
import { ProductForm } from "@/components/products/product-form";

export default function ProductsPage() {
  return (
    <RoleGuard allow={["STORE_OWNER", "STAFF"]}>
      <ProductsContent />
    </RoleGuard>
  );
}

function ProductsContent() {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [page, setPage] = useState(1);
  const [editingProduct, setEditingProduct] = useState<Product | "new" | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);
  const { data: categories } = useCategories();
  const { data, isLoading } = useProducts({
    search: debouncedSearch || undefined,
    category: categoryId || undefined,
    minPrice: minPrice ? Number(minPrice) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    page,
  });
  const deleteProduct = useDeleteProduct();

  async function handleDelete(product: Product) {
    if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    await deleteProduct.mutateAsync(product.id);
  }

  function resetFiltersAndPage() {
    setPage(1);
  }

  return (
    <div>
      <PageHeader
        title="Products"
        description="Search, filter, and manage your catalog."
        action={<Button onClick={() => setEditingProduct("new")}>Add product</Button>}
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Input
            placeholder="Search by name..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetFiltersAndPage();
            }}
          />
        </div>
        <select
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            resetFiltersAndPage();
          }}
          className="rounded border border-border-strong bg-surface px-3 py-2 text-sm text-ink"
        >
          <option value="">All categories</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="w-24">
          <Input
            type="number"
            placeholder="Min $"
            value={minPrice}
            onChange={(e) => {
              setMinPrice(e.target.value);
              resetFiltersAndPage();
            }}
          />
        </div>
        <div className="w-24">
          <Input
            type="number"
            placeholder="Max $"
            value={maxPrice}
            onChange={(e) => {
              setMaxPrice(e.target.value);
              resetFiltersAndPage();
            }}
          />
        </div>
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          title="No products found"
          description="Try adjusting your search or filters, or add your first product."
          action={<Button onClick={() => setEditingProduct("new")}>Add product</Button>}
        />
      ) : (
        <>
          <Table>
            <Thead>
              <Tr>
                <Th></Th>
                <Th>Name</Th>
                <Th>Category</Th>
                <Th>Price</Th>
                <Th>Stock</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody>
              {data.data.map((product) => (
                <Tr key={product.id}>
                  <Td className="w-12">
                    {product.imageUrl ? (
                      <Image
                        src={`${API_BASE_URL}${product.imageUrl}`}
                        alt={product.name}
                        width={32}
                        height={32}
                        className="h-8 w-8 rounded border border-border object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="h-8 w-8 rounded border border-dashed border-border-strong" />
                    )}
                  </Td>
                  <Td>
                    <button
                      onClick={() => setEditingProduct(product)}
                      className="font-medium text-ink hover:text-accent"
                    >
                      {product.name}
                    </button>
                  </Td>
                  <Td className="text-ink-muted">{product.category?.name ?? "-"}</Td>
                  <Td>
                    <Money value={product.price} />
                  </Td>
                  <Td>
                    {product.stock === 0 ? (
                      <Badge tone="danger">Out of stock</Badge>
                    ) : product.stock < 5 ? (
                      <Badge tone="warning">{product.stock} left</Badge>
                    ) : (
                      <span className="font-mono tabular-nums">{product.stock}</span>
                    )}
                  </Td>
                  <Td className="text-right">
                    <button
                      onClick={() => handleDelete(product)}
                      className="text-xs font-medium text-ink-muted hover:text-danger"
                    >
                      Delete
                    </button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          <Pagination meta={data.meta} onPageChange={setPage} />
        </>
      )}

      <Modal
        isOpen={editingProduct !== null}
        onClose={() => setEditingProduct(null)}
        title={editingProduct === "new" ? "Add product" : "Edit product"}
      >
        <ProductForm
          product={editingProduct !== "new" ? (editingProduct ?? undefined) : undefined}
          categories={categories ?? []}
          onSaved={() => setEditingProduct(null)}
        />
      </Modal>
    </div>
  );
}
