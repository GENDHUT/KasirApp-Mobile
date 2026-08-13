import { useEffect, useRef, useState } from "react";
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    ActivityIndicator,
    StyleSheet,
    FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Device } from "react-native-ble-plx";

import { useThemeColors } from "@/hooks/use-theme-colors";
import { type ReceiptOrder } from "@/lib/struk/receipt-types";
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

                    <Text style={{ color: colors.subtext, marginBottom: 4 }}>
                        {receiptOrder?.orderNumber}
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

                    <FlatList
                        data={devices}
                        keyExtractor={(item) => item.id}
                        style={{ maxHeight: 280 }}
                        ListEmptyComponent={
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
                        }
                        renderItem={({ item }) => (
                            <TouchableOpacity
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
                        )}
                    />

                    <TouchableOpacity
                        style={[styles.rescanBtn, { borderColor: colors.border }]}
                        onPress={startScan}
                        disabled={scanning}
                    >
                        <Ionicons name="refresh" size={16} color={colors.text} />
                        <Text style={{ color: colors.text, marginLeft: 6 }}>Cari Ulang</Text>
                    </TouchableOpacity>
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
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8,
    },
    title: { fontSize: 17, fontWeight: "700" },
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