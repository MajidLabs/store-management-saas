import { apiFetch } from "./api-client";
import {
  AuthUser,
  Category,
  Order,
  OrderStatus,
  Paginated,
  Plan,
  Product,
  StaffMember,
  Store,
  Subscription,
} from "./types";

export const authApi = {
  register: (body: { email: string; password: string; storeName: string }) =>
    apiFetch<{ success: true }>("/auth/register", { method: "POST", body, skipAuthRetry: true }),
  login: (body: { email: string; password: string }) =>
    apiFetch<{ success: true }>("/auth/login", { method: "POST", body, skipAuthRetry: true }),
  logout: () => apiFetch<void>("/auth/logout", { method: "POST" }),
  me: () => apiFetch<AuthUser>("/auth/me"),
  requestPasswordReset: (body: { email: string }) =>
    apiFetch<void>("/auth/request-password-reset", { method: "POST", body, skipAuthRetry: true }),
  resetPassword: (body: { token: string; newPassword: string }) =>
    apiFetch<void>("/auth/reset-password", { method: "POST", body, skipAuthRetry: true }),
};

export const storesApi = {
  getMine: () => apiFetch<Store>("/stores/me"),
  updateMine: (body: { name?: string }) =>
    apiFetch<Store>("/stores/me", { method: "PATCH", body }),
  listStaff: () => apiFetch<StaffMember[]>("/stores/me/staff"),
  inviteStaff: (body: { email: string; password: string }) =>
    apiFetch<StaffMember>("/stores/me/staff", { method: "POST", body }),
  removeStaff: (id: string) => apiFetch<void>(`/stores/me/staff/${id}`, { method: "DELETE" }),
};

export interface ProductQuery {
  search?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
}

function toQueryString(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const productsApi = {
  list: (query: ProductQuery) =>
    apiFetch<Paginated<Product>>(`/products${toQueryString(query)}`),
  get: (id: string) => apiFetch<Product>(`/products/${id}`),
  create: (body: {
    name: string;
    description?: string;
    price: number;
    stock?: number;
    categoryId?: string;
  }) => apiFetch<Product>("/products", { method: "POST", body }),
  update: (
    id: string,
    body: Partial<{
      name: string;
      description: string;
      price: number;
      stock: number;
      categoryId: string;
    }>,
  ) => apiFetch<Product>(`/products/${id}`, { method: "PATCH", body }),
  remove: (id: string) => apiFetch<void>(`/products/${id}`, { method: "DELETE" }),
  uploadImage: (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<Product>(`/products/${id}/image`, { method: "POST", body: form });
  },
};

export const categoriesApi = {
  list: () => apiFetch<Category[]>("/categories"),
  create: (body: { name: string }) => apiFetch<Category>("/categories", { method: "POST", body }),
  update: (id: string, body: { name: string }) =>
    apiFetch<Category>(`/categories/${id}`, { method: "PATCH", body }),
  remove: (id: string) => apiFetch<void>(`/categories/${id}`, { method: "DELETE" }),
};

export interface OrderQuery {
  status?: OrderStatus;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export const ordersApi = {
  list: (query: OrderQuery) => apiFetch<Paginated<Order>>(`/orders${toQueryString(query)}`),
  get: (id: string) => apiFetch<Order>(`/orders/${id}`),
  create: (body: { items: { productId: string; quantity: number }[] }) =>
    apiFetch<Order>("/orders", { method: "POST", body }),
  updateStatus: (id: string, status: OrderStatus) =>
    apiFetch<Order>(`/orders/${id}`, { method: "PATCH", body: { status } }),
};

export const billingApi = {
  getSubscription: () => apiFetch<Subscription>("/billing/subscription"),
  createCheckoutSession: (targetPlan: Plan) =>
    apiFetch<{ url: string }>("/billing/checkout-session", {
      method: "POST",
      body: {
        targetPlan,
        successUrl: `${typeof window !== "undefined" ? window.location.origin : ""}/billing?upgraded=1`,
        cancelUrl: `${typeof window !== "undefined" ? window.location.origin : ""}/billing`,
      },
    }),
};

export const adminApi = {
  listStores: (query: { page?: number; limit?: number }) =>
    apiFetch<Paginated<Store>>(`/admin/stores${toQueryString(query)}`),
  setSuspended: (id: string, suspended: boolean) =>
    apiFetch<Store>(`/admin/stores/${id}/suspend`, { method: "PATCH", body: { suspended } }),
};
