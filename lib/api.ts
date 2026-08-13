import { authClient } from "./auth-client";
import { API_URL } from "./auth-client";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const cookies = authClient.getCookie();

  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookies,
      ...options.headers,
    },
  });

  const json = await res.json();

  if (!res.ok || json.success === false) {
    throw new Error(json.error ?? "Terjadi kesalahan");
  }

  return json.data as T;
}

/*
|--------------------------------------------------------------------------
| TYPES (disesuaikan dengan db/schema.ts)
|--------------------------------------------------------------------------
*/

export interface Variant {
  id: string;
  name: string;
}

export interface MenuVariant {
  id: string;
  menuId: string;
  variantId: string;
  price: number;
  available: boolean;
  sortOrder: number;
  variant: Variant;
}

export interface Category {
  id: string;
  name: string;
}

export interface Menu {
  id: string;
  categoryId: string;
  name: string;
  imageUrl: string | null;
  description: string | null;
  available: boolean;
  category: Category;
  menuVariants: MenuVariant[];
}

export interface OrderItem {
  id: string;
  menuId: string;
  menuVariantId: string;
  variantId: string;
  menuName: string;
  variantName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  paymentMethod: "CASH" | "QRIS" | null;
  paymentStatus: "UNPAID" | "PAID" | "REFUNDED";
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paidAmount: number;
  changeAmount: number;
  notes: string | null;
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  user: {
    id: string;
    name: string;
    email: string;
  };
  items: OrderItem[];
}

export interface CreateOrderItemInput {
  menuId: string;
  menuVariantId: string;
  quantity: number;
}

export interface CreateOrderInput {
  items: CreateOrderItemInput[];
  discount?: number;
  tax?: number;
  notes?: string;
}

export interface PayOrderInput {
  method: "CASH" | "QRIS";
  paidAmount?: number;
}

/*
|--------------------------------------------------------------------------
| API CLIENT
|--------------------------------------------------------------------------
*/

export const api = {
  // MENU
  getMenus: () => request<Menu[]>("/menu"),
  getMenuById: (id: string) => request<Menu>(`/menu/${id}`),

  // CATEGORY & VARIANT (untuk halaman admin nanti)
  getCategories: () => request<Category[]>("/category"),
  getVariants: () => request<Variant[]>("/variant"),

  // ORDERS (pesanan / kasir)
  getPendingOrders: () => request<Order[]>("/orders?status=pending"),
  getCompletedOrders: () => request<Order[]>("/orders?status=completed"),
  getOrderById: (id: string) => request<Order>(`/orders/${id}`),

  createOrder: (body: CreateOrderInput) =>
    request<{ success: boolean; orderId: string; orderNumber: string; total: number }>(
      "/orders",
      { method: "POST", body: JSON.stringify(body) }
    ),

  updateOrder: (id: string, body: Partial<CreateOrderInput>) =>
    request(`/orders/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  cancelOrder: (id: string) =>
    request(`/orders/${id}/cancel`, { method: "POST" }),

  payOrder: (id: string, body: PayOrderInput) =>
    request<{ success: boolean; changeAmount?: number }>(
      `/orders/${id}/pay`,
      { method: "POST", body: JSON.stringify(body) }
    ),

  // HISTORY (ADMIN only, dipakai di Dashboard)
  getHistoryOrders: (page = 1, search?: string) =>
    request<{
      data: Order[];
      pagination: {
        page: number;
        limit: number;
        totalItems: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
      };
    }>(`/history/orders?page=${page}${search ? `&search=${encodeURIComponent(search)}` : ""}`),

  getHistorySummary: () => request<any>("/history/summary"),
  getHistoryRevenueByUser: () => request<any[]>("/history/revenue-by-user"),
};