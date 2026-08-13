/*
|--------------------------------------------------------------------------
| RECEIPT TYPES & CONFIG
|--------------------------------------------------------------------------
|
| Sama persis dengan versi web -- murni logic TS/Intl, tanpa DOM,
| sehingga 100% reusable di Expo.
|
*/

export interface ReceiptItem {
    id: string;
    menuName: string;
    variantName?: string | null;
    quantity: number;
    unitPrice: number;
    subtotal: number;
}

export type ReceiptPaymentMethod =
    | "CASH"
    | "QRIS"
    | "TRANSFER"
    | "DEBIT"
    | "CREDIT"
    | "OTHER"
    | null
    | undefined;

export interface ReceiptOrder {
    id: string;
    orderNumber: string;
    items: ReceiptItem[];
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    paymentMethod: ReceiptPaymentMethod;
    paidAmount: number;
    changeAmount: number;
    cashierName: string;
    notes?: string | null;
    completedAt: Date | string | null;
}

/*
|--------------------------------------------------------------------------
| STORE INFO
|--------------------------------------------------------------------------
*/

export const STORE_INFO = {
    name: "Drink & Food Ala-Ala",
    address: "Citra Indah Atas",
    phone: "0882-9405-4850",
    instagram: "@alaaladini.id",
    footerNote: "Terimakasih",
    logoUrl: "/Logo.webp",
};

/*
|--------------------------------------------------------------------------
| LABELS
|--------------------------------------------------------------------------
*/

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
    CASH: "Tunai",
    QRIS: "QRIS",
    TRANSFER: "Transfer",
    DEBIT: "Debit",
    CREDIT: "Credit",
    OTHER: "Lainnya",
};

/*
|--------------------------------------------------------------------------
| FORMATTERS
|--------------------------------------------------------------------------
*/

export function formatCurrency(value: number) {
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
    }).format(Number(value) || 0);
}

export function formatReceiptDate(date: Date | string | null) {
    if (!date) {
        return "-";
    }

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
        return "-";
    }

    const datePart = new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    })
        .format(parsedDate)
        .replaceAll("/", "-");

    const timePart = new Intl.DateTimeFormat("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
    }).format(parsedDate);

    return `${datePart} ${timePart}`;
}

export function getPaymentMethodLabel(method: ReceiptPaymentMethod) {
    if (!method) {
        return "-";
    }

    return PAYMENT_METHOD_LABEL[method] ?? method;
}