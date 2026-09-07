import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { categoriesApi } from "@/lib/api";

export function useCategories() {
  return useQuery({ queryKey: ["categories"], queryFn: categoriesApi.list });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: categoriesApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: categoriesApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      // A deleted category's products get categoryId=null server-side (ON
      // DELETE SET NULL) - refresh product lists too so that's reflected.
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
