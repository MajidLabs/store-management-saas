"use client";

import { useState } from "react";
import { Product } from "@/lib/types";
import { ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBanner, Money } from "@/components/ui/primitives";
import { useCreateOrder } from "@/hooks/use-orders";

interface LineItem {
  productId: string;
  quantity: number;
}

export function CreateOrderForm({
  products,
  onSaved,
}: {
  products: Product[];
  onSaved: () => void;
}) {
  const [items, setItems] = useState<LineItem[]>([{ productId: "", quantity: 1 }]);
  const [error, setError] = useState<string | null>(null);
  const createOrder = useCreateOrder();

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addLine() {
    setItems((prev) => [...prev, { productId: "", quantity: 1 }]);
  }

  function removeLine(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const estimatedTotal = items.reduce((sum, item) => {
    const product = products.find((p) => p.id === item.productId);
    return sum + (product ? product.price * item.quantity : 0);
  }, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const validItems = items.filter((i) => i.productId && i.quantity > 0);
    if (validItems.length === 0) {
      setError("Add at least one product.");
      return;
    }
    try {
      await createOrder.mutateAsync({ items: validItems });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create order.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <ErrorBanner message={error} />}

      <div className="flex flex-col gap-3">
        {items.map((item, index) => {
          const product = products.find((p) => p.id === item.productId);
          return (
            <div key={index} className="flex items-end gap-2">
              <div className="flex-1">
                <select
                  value={item.productId}
                  onChange={(e) => updateItem(index, { productId: e.target.value })}
                  required
                  className="w-full rounded border border-border-strong bg-surface px-3 py-2 text-sm text-ink"
                >
                  <option value="">Select product...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.stock === 0}>
                      {p.name} ({p.stock} in stock)
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-20">
                <Input
                  type="number"
                  min={1}
                  max={product?.stock}
                  value={item.quantity}
                  onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })}
                  required
                />
              </div>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeLine(index)}
                  className="pb-2 text-xs font-medium text-ink-muted hover:text-danger"
                >
                  Remove
                </button>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addLine}
        className="self-start text-sm font-medium text-accent hover:underline"
      >
        + Add another product
      </button>

      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="text-sm text-ink-muted">Estimated total</span>
        <Money value={estimatedTotal} className="text-base font-semibold text-ink" />
      </div>

      <Button type="submit" isLoading={createOrder.isPending}>
        Create order
      </Button>
    </form>
  );
}
