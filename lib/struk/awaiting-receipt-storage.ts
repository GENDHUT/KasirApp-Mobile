import AsyncStorage from "@react-native-async-storage/async-storage";

import { type Order } from "@/lib/api";

const KEY = "struk:awaitingReceipts";

/*
|--------------------------------------------------------------------------
| AWAITING RECEIPT STORAGE
|--------------------------------------------------------------------------
|
| Menyimpan pesanan ONLINE yang statusnya sudah COMPLETED di server tapi
| strukNYA BELUM DICETAK. Server sudah tidak menganggap ini "pending"
| (statusnya COMPLETED), jadi kalau tidak kita tahan secara lokal,
| pesanan ini akan langsung hilang dari tabel Pesanan Pending begitu
| dibayar -- padahal user belum sempat cetak struk.
|
| Setelah struk berhasil dicetak, entry-nya dihapus dari sini (order
| tetap ada normal di History).
|
*/

export interface AwaitingReceipt {
    order: Order;
    addedAt: string;
}

export async function getAwaitingReceipts(): Promise<AwaitingReceipt[]> {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
}

async function setAwaitingReceipts(list: AwaitingReceipt[]) {
    await AsyncStorage.setItem(KEY, JSON.stringify(list));
}

export async function addAwaitingReceipt(order: Order) {
    const list = await getAwaitingReceipts();

    if (list.some((item) => item.order.id === order.id)) {
        return;
    }

    list.push({ order, addedAt: new Date().toISOString() });
    await setAwaitingReceipts(list);
}

export async function removeAwaitingReceipt(orderId: string) {
    const list = await getAwaitingReceipts();
    await setAwaitingReceipts(list.filter((item) => item.order.id !== orderId));
}