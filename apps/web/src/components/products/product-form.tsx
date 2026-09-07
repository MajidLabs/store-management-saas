"use client";

import { useState } from "react";
import Image from "next/image";
import { Product, Category } from "@/lib/types";
import { API_BASE_URL, ApiError } from "@/lib/api-client";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/primitives";
import { useCreateProduct, useUpdateProduct, useUploadProductImage } from "@/hooks/use-products";

export function ProductForm({
  product,
  categories,
  onSaved,
}: {
  product?: Product;
  categories: Category[];
  onSaved: () => void;
}) {
  const isEditing = !!product;
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const uploadImage = useUploadProductImage();

  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [price, setPrice] = useState(product ? String(product.price) : "");
  const [stock, setStock] = useState(product ? String(product.stock) : "0");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? null);
  const [error, setError] = useState<string | null>(null);

  const isSaving = createProduct.isPending || updateProduct.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const body = {
      name,
      description: description || undefined,
      price: parseFloat(price),
      stock: parseInt(stock, 10),
      categoryId: categoryId || undefined,
    };
    try {
      if (isEditing) {
        await updateProduct.mutateAsync({ id: product.id, body });
      } else {
        await createProduct.mutateAsync(body);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save product.");
    }
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !product) return;
    setError(null);
    try {
      const updated = await uploadImage.mutateAsync({ id: product.id, file });
      setImageUrl(updated.imageUrl);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't upload image.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <ErrorBanner message={error} />}

      <Field label="Name" htmlFor="name">
        <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>

      <Field label="Description" htmlFor="description">
        <Textarea
          id="description"
          rows={2}
          value={description ?? ""}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Price" htmlFor="price">
          <Input
            id="price"
            type="number"
            step="0.01"
            min="0"
            required
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </Field>
        <Field label="Stock" htmlFor="stock">
          <Input
            id="stock"
            type="number"
            step="1"
            min="0"
            required
            value={stock}
            onChange={(e) => setStock(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Category" htmlFor="category">
        <select
          id="category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-full rounded border border-border-strong bg-surface px-3 py-2 text-sm text-ink"
        >
          <option value="">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      {isEditing && (
        <Field label="Image" htmlFor="image">
          <div className="flex items-center gap-3">
            {imageUrl && (
              <Image
                src={`${API_BASE_URL}${imageUrl}`}
                alt={name}
                width={40}
                height={40}
                className="h-10 w-10 rounded border border-border object-cover"
                unoptimized
              />
            )}
            <input
              id="image"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleImageChange}
              disabled={uploadImage.isPending}
              className="text-xs text-ink-muted file:mr-3 file:rounded file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-accent"
            />
          </div>
        </Field>
      )}

      <Button type="submit" isLoading={isSaving} className="mt-2">
        {isEditing ? "Save changes" : "Create product"}
      </Button>
    </form>
  );
}
