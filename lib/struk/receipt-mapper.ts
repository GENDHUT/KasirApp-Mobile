import { type Order } from "@/lib/api";
import { type LocalOrder } from "@/lib/offline-storage";
import { type ReceiptOrder } from "./receipt-types";

/*
|--------------------------------------------------------------------------
| MAPPER: Order (server, online) -> ReceiptOrder
|--------------------------------------------------------------------------
*/

export function toReceiptOrder(order: Order): ReceiptOrder {
    return {
        id: order.id,
        orderNumber: order.orderNumber,

        items: order.items.map((item) => ({
            id: item.id,
            menuName: item.menuName,
            variantName: item.variantName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
        })),

        subtotal: order.subtotal,
        discount: order.discount,
        tax: order.tax,
        total: order.total,

        paymentMethod: order.paymentMethod,
        paidAmount: order.paidAmount,
        changeAmount: order.changeAmount,

        cashierName: order.user?.name ?? "-",
        notes: order.notes,
        completedAt: order.completedAt,
    };
}

/*
|--------------------------------------------------------------------------
| MAPPER: LocalOrder (offline, belum sync) -> ReceiptOrder
|--------------------------------------------------------------------------
|
| Dipakai supaya pesanan offline yang belum tersinkron ke server tetap
| bisa dicetak strukNYA kapan saja, tanpa harus menunggu sync dulu.
|
*/

export function toReceiptOrderFromLocal(order: LocalOrder): ReceiptOrder {
    return {
        id: order.localId,
        orderNumber: order.orderNumber,

        items: order.items.map((item, index) => ({
            id: `${order.localId}-${index}`,
            menuName: item.menuName,
            variantName: item.variantName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
        })),

        subtotal: order.subtotal,
        discount: order.discount,
        tax: order.tax,
        total: order.total,

        paymentMethod: order.paymentMethod,
        paidAmount: order.paidAmount,
        changeAmount: order.changeAmount,

        cashierName: "Kasir (Offline)",
        notes: order.notes,
        completedAt: order.completedAt,
    };
}