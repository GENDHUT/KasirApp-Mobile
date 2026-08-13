import AsyncStorage from "@react-native-async-storage/async-storage";

import { api, type Menu } from "./api";

/*
|--------------------------------------------------------------------------
| KEYS
|--------------------------------------------------------------------------
*/

const KEYS = {
  MENUS: "offline:menus",
  ORDERS: "offline:orders",
};

/*
|--------------------------------------------------------------------------
| ID GENERATOR
|--------------------------------------------------------------------------
|
| crypto.randomUUID() tersedia di Expo SDK baru (Hermes), tapi kita
| sediakan fallback manual untuk jaga-jaga.
|
*/

export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function generateLocalOrderNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();

  return `OFF-${y}${m}${d}-${rand}`;
}

/*
|--------------------------------------------------------------------------
| MENU CACHE
|--------------------------------------------------------------------------
*/

export async function cacheMenus(menus: Menu[]) {
  await AsyncStorage.setItem(KEYS.MENUS, JSON.stringify(menus));
}

export async function getCachedMenus(): Promise<Menu[]> {
  const raw = await AsyncStorage.getItem(KEYS.MENUS);
  return raw ? JSON.parse(raw) : [];
}

/*
|--------------------------------------------------------------------------
| LOAD MENU DENGAN FALLBACK OTOMATIS
|--------------------------------------------------------------------------
|
| Coba ambil dari API dulu. Kalau gagal (offline), pakai cache terakhir.
| offline=true menandakan data yang dikembalikan berasal dari cache.
|
*/

export async function loadMenusWithFallback(): Promise<{
  menus: Menu[];
  offline: boolean;
}> {
  try {
    const data = await api.getMenus();
    await cacheMenus(data);
    return { menus: data, offline: false };
  } catch {
    const cached = await getCachedMenus();
    return { menus: cached, offline: true };
  }
}

/*
|--------------------------------------------------------------------------
| LOCAL ORDER TYPES
|--------------------------------------------------------------------------
*/

export interface LocalOrderItem {
  menuId: string;
  menuVariantId: string;
  variantId: string;
  menuName: string;
  variantName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface LocalOrder {
  localId: string; // selalu berprefix "local_"
  orderNumber: string;
  status: "PENDING" | "COMPLETED";
  paymentMethod: "CASH" | "QRIS" | null;
  paymentStatus: "UNPAID" | "PAID";
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paidAmount: number;
  changeAmount: number;
  notes: string | null;
  items: LocalOrderItem[];
  createdAt: string; // ISO string, waktu order ASLI dibuat
  completedAt: string | null; // ISO string, waktu ASLI dibayar
  cancelledAt: string | null;
  synced: boolean;
}

/*
|--------------------------------------------------------------------------
| LOCAL ORDER CRUD
|--------------------------------------------------------------------------
*/

export async function getLocalOrders(): Promise<LocalOrder[]> {
  const raw = await AsyncStorage.getItem(KEYS.ORDERS);
  return raw ? JSON.parse(raw) : [];
}

async function setLocalOrders(orders: LocalOrder[]) {
  await AsyncStorage.setItem(KEYS.ORDERS, JSON.stringify(orders));
}

export async function saveLocalOrder(order: LocalOrder) {
  const orders = await getLocalOrders();
  orders.push(order);
  await setLocalOrders(orders);
}

export async function updateLocalOrder(
  localId: string,
  updates: Partial<LocalOrder>
): Promise<LocalOrder | null> {
  const orders = await getLocalOrders();
  const index = orders.findIndex((o) => o.localId === localId);

  if (index === -1) return null;

  orders[index] = { ...orders[index], ...updates };
  await setLocalOrders(orders);

  return orders[index];
}

export async function deleteLocalOrder(localId: string) {
  const orders = await getLocalOrders();
  await setLocalOrders(orders.filter((o) => o.localId !== localId));
}

export async function getLocalOrderById(localId: string): Promise<LocalOrder | null> {
  const orders = await getLocalOrders();
  return orders.find((o) => o.localId === localId) ?? null;
}