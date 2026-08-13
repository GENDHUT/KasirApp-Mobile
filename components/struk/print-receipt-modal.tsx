import { useEffect, useRef, useState } from "react";
import {
    View,
    Text,
    Image,
    Modal,
    TouchableOpacity,
    ActivityIndicator,
    StyleSheet,
    ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Device } from "react-native-ble-plx";

import { useThemeColors } from "@/hooks/use-theme-colors";
import {
    type ReceiptOrder,
    STORE_INFO,
    formatCurrency,
    formatReceiptDate,
    getPaymentMethodLabel,
} from "@/lib/struk/receipt-types";
import { buildReceiptEscPos } from "@/lib/struk/escpos";
import {
    connectToPrinter,
    printReceiptBytes,
    requestBlePermissions,
    scanForPrinters,
    stopScan,
} from "@/lib/struk/thermal-printer";

interface PrintReceiptModalProps {
    visible: boolean;
    receiptOrder: ReceiptOrder | null;
    onClose: () => void;
    /** Dipanggil HANYA saat struk berhasil dicetak (bukan saat modal ditutup manual). */
    onPrintSuccess?: () => void;
}

/*
|--------------------------------------------------------------------------
| RECEIPT PREVIEW
|--------------------------------------------------------------------------
|
| Representasi visual dari struk yang akan dicetak (mirip kertas thermal
| 58mm), supaya kasir tahu bentuk strukNYA sebelum benar-benar dicetak.
|
| Murni tampilan, tidak mempengaruhi hasil ESC/POS (escpos.ts tetap
| sumber kebenaran untuk hasil cetak fisik).
|
*/

function ReceiptRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
    return (
        <View style={receiptStyles.row}>
            <Text
                style={[receiptStyles.rowText, bold && receiptStyles.bold]}
                numberOfLines={1}
            >
                {label}
            </Text>
            <Text
                style={[receiptStyles.rowText, bold && receiptStyles.bold]}
                numberOfLines={1}
            >
                {value}
            </Text>
        </View>
    );
}

function ReceiptPreview({ receiptOrder }: { receiptOrder: ReceiptOrder }) {
    return (
        <View style={receiptStyles.paper}>
            {/* LOGO */}
            <Image
                source={require("@/assets/images/Logo.png")}
                style={receiptStyles.logo}
                resizeMode="contain"
            />

            {/* HEADER TOKO */}
            <Text style={receiptStyles.storeName}>
                {STORE_INFO.name.toUpperCase()}
            </Text>

            {!!STORE_INFO.address && (
                <Text style={receiptStyles.storeInfo}>{STORE_INFO.address}</Text>
            )}

            {!!STORE_INFO.phone && (
                <Text style={receiptStyles.storeInfo}>{STORE_INFO.phone}</Text>
            )}

            {!!STORE_INFO.instagram && (
                <Text style={receiptStyles.storeInfo}>
                    Instagram: {STORE_INFO.instagram}
                </Text>
            )}

            <View style={receiptStyles.dashed} />

            {/* META PESANAN */}
            <ReceiptRow label="No" value={receiptOrder.orderNumber || "-"} />
            <ReceiptRow
                label="Tanggal"
                value={formatReceiptDate(receiptOrder.completedAt)}
            />
            <ReceiptRow label="Kasir" value={receiptOrder.cashierName || "-"} />
            <ReceiptRow
                label="Pembayaran"
                value={getPaymentMethodLabel(receiptOrder.paymentMethod)}
            />

            <View style={receiptStyles.dashed} />

            {/* ITEMS */}
            {receiptOrder.items.map((item) => {
                const itemName =
                    item.variantName && item.variantName.trim().length > 0
                        ? `${item.menuName} (${item.variantName})`
                        : item.menuName;

                return (
                    <View key={item.id} style={{ marginBottom: 6 }}>
                        <Text style={[receiptStyles.rowText, receiptStyles.bold]}>
                            {itemName}
                        </Text>
                        <ReceiptRow
                            label={`${formatCurrency(item.unitPrice)} x${item.quantity}`}
                            value={formatCurrency(item.subtotal)}
                        />
                    </View>
                );
            })}

            <View style={receiptStyles.dashed} />

            {/* SUBTOTAL / DISKON / PAJAK */}
            <ReceiptRow
                label="Subtotal"
                value={formatCurrency(receiptOrder.subtotal)}
            />

            {receiptOrder.discount > 0 && (
                <ReceiptRow
                    label="Diskon"
                    value={`-${formatCurrency(receiptOrder.discount)}`}
                />
            )}

            {receiptOrder.tax > 0 && (
                <ReceiptRow label="Pajak" value={formatCurrency(receiptOrder.tax)} />
            )}

            {/* TOTAL */}
            <ReceiptRow
                label="TOTAL"
                value={formatCurrency(receiptOrder.total)}
                bold
            />

            {/* BAYAR / KEMBALI */}
            <ReceiptRow
                label="Bayar"
                value={formatCurrency(receiptOrder.paidAmount)}
            />

            {receiptOrder.changeAmount > 0 && (
                <ReceiptRow
                    label="Kembali"
                    value={formatCurrency(receiptOrder.changeAmount)}
                />
            )}

            {/* CATATAN */}
            {!!receiptOrder.notes && receiptOrder.notes.trim().length > 0 && (
                <>
                    <View style={receiptStyles.dashed} />
                    <Text style={[receiptStyles.rowText, receiptStyles.bold]}>
                        Catatan
                    </Text>
                    <Text style={receiptStyles.rowText}>{receiptOrder.notes}</Text>
                </>
            )}

            {/* FOOTER */}
            <View style={receiptStyles.dashed} />

            <Text style={receiptStyles.footerNote}>{STORE_INFO.footerNote}</Text>
        </View>
    );
}

const receiptStyles = StyleSheet.create({
    paper: {
        width: 260,
        alignSelf: "center",
        backgroundColor: "#ffffff",
        paddingVertical: 16,
        paddingHorizontal: 14,
        borderRadius: 4,
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 3,
    },
    logo: {
        width: 48,
        height: 48,
        alignSelf: "center",
        marginBottom: 6,
    },
    storeName: {
        color: "#000",
        fontFamily: "monospace",
        fontWeight: "700",
        fontSize: 13,
        textAlign: "center",
    },
    storeInfo: {
        color: "#000",
        fontFamily: "monospace",
        fontSize: 10,
        textAlign: "center",
    },
    dashed: {
        borderBottomWidth: 1,
        borderStyle: "dashed",
        borderBottomColor: "#000",
        marginVertical: 8,
    },
    row: {
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 8,
    },
    rowText: {
        color: "#000",
        fontFamily: "monospace",
        fontSize: 11,
        flexShrink: 1,
    },
    bold: {
        fontWeight: "700",
    },
    footerNote: {
        color: "#000",
        fontFamily: "monospace",
        fontSize: 11,
        fontWeight: "700",
        textAlign: "center",
    },
});

/*
|--------------------------------------------------------------------------
| PRINT RECEIPT MODAL
|--------------------------------------------------------------------------
|
| Dipakai di:
| 1. index.tsx     -> pesanan online yang sudah dibayar, menunggu cetak.
| 2. index.tsx     -> pesanan offline yang sudah dibayar (belum sync).
| 3. dashboard.tsx -> reprint bebas dari History.
|
*/

export function PrintReceiptModal({
    visible,
    receiptOrder,
    onClose,
    onPrintSuccess,
}: PrintReceiptModalProps) {
    const colors = useThemeColors();

    const [devices, setDevices] = useState<Device[]>([]);
    const [scanning, setScanning] = useState(false);
    const [connectingId, setConnectingId] = useState<string | null>(null);
    const [printing, setPrinting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const stopScanRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        if (!visible) {
            stopScanRef.current?.();
            return;
        }

        startScan();

        return () => {
            stopScanRef.current?.();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    async function startScan() {
        setError(null);
        setDevices([]);

        const granted = await requestBlePermissions();

        if (!granted) {
            setError("Izin Bluetooth ditolak. Aktifkan di pengaturan aplikasi.");
            return;
        }

        setScanning(true);

        stopScanRef.current = scanForPrinters(
            (device) => {
                setDevices((prev) =>
                    prev.some((d) => d.id === device.id) ? prev : [...prev, device]
                );
            },
            (message) => {
                setError(message);
                setScanning(false);
            },
            8000
        );

        setTimeout(() => setScanning(false), 8000);
    }

    async function handleSelectPrinter(device: Device) {
        if (!receiptOrder) return;

        setConnectingId(device.id);
        setError(null);

        try {
            stopScan();
            await connectToPrinter(device.id);

            setPrinting(true);

            const data = buildReceiptEscPos(receiptOrder);
            await printReceiptBytes(data);

            onPrintSuccess?.();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Gagal mencetak struk.");
        } finally {
            setConnectingId(null);
            setPrinting(false);
        }
    }

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View
                    style={[styles.sheet, { backgroundColor: colors.bg, borderColor: colors.border }]}
                >
                    <View style={styles.header}>
                        <Text style={[styles.title, { color: colors.text }]}>Cetak Struk</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Ionicons name="close" size={22} color={colors.text} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        style={{ maxHeight: "100%" }}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* PREVIEW STRUK */}
                        {receiptOrder && (
                            <View style={{ marginBottom: 18 }}>
                                <Text style={[styles.sectionLabel, { color: colors.subtext }]}>
                                    Preview Struk
                                </Text>

                                <ReceiptPreview receiptOrder={receiptOrder} />
                            </View>
                        )}

                        {/* PILIH PRINTER */}
                        <Text style={[styles.sectionLabel, { color: colors.subtext }]}>
                            Pilih Printer
                        </Text>

                        <Text style={{ color: colors.subtext, marginBottom: 12 }}>
                            Pilih printer thermal Bluetooth (58mm) yang sudah dinyalakan.
                        </Text>

                        {error && (
                            <View style={styles.errorBox}>
                                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                                <Text style={{ color: colors.danger, marginLeft: 6, flex: 1 }}>
                                    {error}
                                </Text>
                            </View>
                        )}

                        {devices.length === 0 ? (
                            <View style={{ paddingVertical: 24, alignItems: "center" }}>
                                {scanning ? (
                                    <>
                                        <ActivityIndicator color={colors.primary} />
                                        <Text style={{ color: colors.subtext, marginTop: 8 }}>
                                            Mencari printer...
                                        </Text>
                                    </>
                                ) : (
                                    <Text style={{ color: colors.subtext }}>
                                        Printer tidak ditemukan.
                                    </Text>
                                )}
                            </View>
                        ) : (
                            devices.map((item) => (
                                <TouchableOpacity
                                    key={item.id}
                                    style={[
                                        styles.deviceRow,
                                        { borderColor: colors.border, backgroundColor: colors.card },
                                    ]}
                                    onPress={() => handleSelectPrinter(item)}
                                    disabled={connectingId !== null || printing}
                                >
                                    <Ionicons name="bluetooth-outline" size={18} color={colors.primary} />
                                    <Text style={{ color: colors.text, flex: 1, marginLeft: 10 }}>
                                        {item.name ?? "Printer Tanpa Nama"}
                                    </Text>
                                    {connectingId === item.id ? (
                                        <ActivityIndicator color={colors.primary} size="small" />
                                    ) : (
                                        <Ionicons name="chevron-forward" size={18} color={colors.subtext} />
                                    )}
                                </TouchableOpacity>
                            ))
                        )}

                        <TouchableOpacity
                            style={[styles.rescanBtn, { borderColor: colors.border }]}
                            onPress={startScan}
                            disabled={scanning}
                        >
                            <Ionicons name="refresh" size={16} color={colors.text} />
                            <Text style={{ color: colors.text, marginLeft: 6 }}>Cari Ulang</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
    sheet: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderWidth: 1,
        padding: 20,
        paddingBottom: 32,
        maxHeight: "88%",
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
    },
    title: { fontSize: 17, fontWeight: "700" },
    sectionLabel: {
        fontSize: 12,
        fontWeight: "700",
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    errorBox: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "rgba(239,68,68,0.08)",
        borderRadius: 8,
        padding: 10,
        marginBottom: 12,
    },
    deviceRow: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderRadius: 10,
        padding: 12,
        marginBottom: 8,
    },
    rescanBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 10,
        marginTop: 8,
    },
});