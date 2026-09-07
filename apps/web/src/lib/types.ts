export type Role = "SUPER_ADMIN" | "STORE_OWNER" | "STAFF";
export type Plan = "FREE" | "PRO";
export type SubscriptionStatus = "ACTIVE" | "PAST_DUE" | "CANCELLED";
export type OrderStatus = "PENDING" | "COMPLETED" | "CANCELLED";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  storeId: string | null;
}

export interface Store {
  id: string;
  name: string;
  ownerId: string;
  isSuspended: boolean;
  createdAt: string;
  updatedAt: string;
  subscription?: Subscription;
}

export interface Subscription {
  id: string;
  storeId: string;
  plan: Plan;
  status: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffMember {
  id: string;
  email: string;
  role: Role;
  storeId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  storeId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  storeId: string;
  categoryId: string | null;
  category?: Category | null;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  createdAt: string;
}

export interface Order {
  id: string;
  storeId: string;
  status: OrderStatus;
  total: number;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
}
