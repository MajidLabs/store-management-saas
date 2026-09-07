import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ordersApi, OrderQuery } from "@/lib/api";
import { OrderStatus } from "@/lib/types";

export function useOrders(query: OrderQuery) {
  return useQuery({ queryKey: ["orders", query], queryFn: () => ordersApi.list(query) });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ordersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      // Stock changed - product lists (and their displayed stock counts) are stale now.
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
      ordersApi.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      // Cancelling restocks items server-side - product stock is stale now too.
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
