"use client";

import { useState } from "react";
import { useCategories, useCreateCategory, useDeleteCategory } from "@/hooks/use-categories";
import { PageHeader } from "@/components/layout/page-header";
import { RoleGuard } from "@/components/layout/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, EmptyState, ErrorBanner, PageSpinner } from "@/components/ui/primitives";
import { ApiError } from "@/lib/api-client";

export default function CategoriesPage() {
  return (
    <RoleGuard allow={["STORE_OWNER", "STAFF"]}>
      <CategoriesContent />
    </RoleGuard>
  );
}

function CategoriesContent() {
  const { data: categories, isLoading } = useCategories();
  const createCategory = useCreateCategory();
  const deleteCategory = useDeleteCategory();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createCategory.mutateAsync({ name });
      setName("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create category.");
    }
  }

  async function handleDelete(id: string, categoryName: string) {
    if (
      !confirm(
        `Delete "${categoryName}"? Its products will keep their other details but lose this category.`,
      )
    ) {
      return;
    }
    await deleteCategory.mutateAsync(id);
  }

  return (
    <div>
      <PageHeader title="Categories" description="Group products so they're easier to find and filter." />

      <form onSubmit={handleCreate} className="mb-6 flex items-end gap-2">
        <div className="max-w-xs flex-1">
          <Input
            placeholder="New category name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={1}
          />
        </div>
        <Button type="submit" isLoading={createCategory.isPending}>
          Add
        </Button>
      </form>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      {isLoading ? (
        <PageSpinner />
      ) : !categories || categories.length === 0 ? (
        <EmptyState title="No categories yet" description="Add one above to start organizing products." />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {categories.map((category) => (
              <li key={category.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-ink">{category.name}</span>
                <button
                  onClick={() => handleDelete(category.id, category.name)}
                  className="text-xs font-medium text-ink-muted hover:text-danger"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
