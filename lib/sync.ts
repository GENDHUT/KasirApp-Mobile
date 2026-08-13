import { api, NetworkError } from "./api";
import {
  deleteLocalOrder,
  getLocalOrders,
  type LocalOrder,
} from "./offline-storage";

export interface SyncResult {
  syncedCount: number;
  failedCount: number;
  errors: { orderNumber: string; message: string }[];
}

async function syncOneOrder(order: LocalOrder): Promise<{ success: boolean; error?: string }> {
  if (order.status !== "COMPLETED" || !order.paymentMethod || !order.completedAt) {
    return { success: false, error: "Pesanan belum dibayar." };
  }

  try {
    await api.syncOfflineOrder({
      items: order.items.map((item) => ({
        menuId: item.menuId,
        menuVariantId: item.menuVariantId,
        quantity: item.quantity,
      })),
      discount: order.discount,
      tax: order.tax,
      notes: order.notes ?? undefined,
      paymentMethod: order.paymentMethod,
      paidAmount: order.paidAmount,
      changeAmount: order.changeAmount,
      createdAt: order.createdAt,
      completedAt: order.completedAt,
      clientOrderId: order.localId,
    });

    await deleteLocalOrder(order.localId);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof NetworkError
          ? "Tidak ada koneksi internet."
          : err instanceof Error
          ? err.message
          : "Gagal sinkronisasi.",
    };
  }
}

/*
|--------------------------------------------------------------------------
| SYNC 1 PESANAN
|--------------------------------------------------------------------------
*/

export async function syncSingleLocalOrder(localId: string) {
  const orders = await getLocalOrders();
  const order = orders.find((o) => o.localId === localId);

  if (!order) {
    return { success: false, error: "Pesanan tidak ditemukan." };
  }

  return syncOneOrder(order);
}

/*
|--------------------------------------------------------------------------
| SYNC SEMUA PESANAN YANG SUDAH DIBAYAR TAPI BELUM TERSINKRON
|--------------------------------------------------------------------------
|
| Diurutkan dari yang paling lama supaya urutan masuk ke server sesuai
| kronologis transaksi asli.
|
*/

export async function syncAllLocalOrders(): Promise<SyncResult> {
  const orders = await getLocalOrders();

  const toSync = orders
    .filter((o) => o.status === "COMPLETED" && !o.synced)
    .sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

  const result: SyncResult = { syncedCount: 0, failedCount: 0, errors: [] };

  for (const order of toSync) {
    const outcome = await syncOneOrder(order);

    if (outcome.success) {
      result.syncedCount += 1;
    } else {
      result.failedCount += 1;
      result.errors.push({
        orderNumber: order.orderNumber,
        message: outcome.error ?? "Gagal sinkronisasi.",
      });

      // kalau gagal karena tidak ada koneksi, hentikan -- tidak ada
      // gunanya mencoba sisa pesanan lain kalau memang sedang offline
      if (outcome.error === "Tidak ada koneksi internet.") {
        break;
      }
    }
  }

  return result;
}