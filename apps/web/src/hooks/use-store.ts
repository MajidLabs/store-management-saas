import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { storesApi, billingApi, adminApi } from "@/lib/api";
import { Plan } from "@/lib/types";

export function useMyStore() {
  return useQuery({ queryKey: ["store", "me"], queryFn: storesApi.getMine });
}

export function useStaff() {
  return useQuery({ queryKey: ["staff"], queryFn: storesApi.listStaff });
}

export function useInviteStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: storesApi.inviteStaff,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff"] }),
  });
}

export function useRemoveStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: storesApi.removeStaff,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["staff"] }),
  });
}

export function useSubscription() {
  return useQuery({ queryKey: ["subscription"], queryFn: billingApi.getSubscription });
}

export function useCreateCheckoutSession() {
  return useMutation({
    mutationFn: (targetPlan: Plan) => billingApi.createCheckoutSession(targetPlan),
  });
}

export function useAdminStores(query: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: ["admin", "stores", query],
    queryFn: () => adminApi.listStores(query),
  });
}

export function useSetStoreSuspended() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, suspended }: { id: string; suspended: boolean }) =>
      adminApi.setSuspended(id, suspended),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "stores"] }),
  });
}
