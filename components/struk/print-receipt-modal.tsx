import { useEffect, useRef, useState } from "react";
import { View, Text, Image, Modal, Switch, TouchableOpacity, ActivityIndicator, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { type BluetoothDevice } from "react-native-bluetooth-classic";

import { useThemeColors } from "@/hooks/use-theme-colors";
import { type ReceiptOrder, STORE_INFO, formatCurrency, formatReceiptDate, getPaymentMethodLabel } from "@/lib/struk/receipt-types";
import { buildReceiptEscPos } from "@/lib/struk/escpos";
import { getLogoRaster } from "@/lib/struk/logo-raster";
import {
  connectToPrinter,
  getConnectedDeviceId,
  isPrinterConnected,
  printReceiptBytes,
  requestBlePermissions,
  getPairedPrinters,
  isBluetoothEnabled,
  requestEnableBluetooth,
  openBluetoothSettings,
} from "@/lib/struk/thermal-printer";

/*
|--------------------------------------------------------------------------
| PROPS
|--------------------------------------------------------------------------
*/

interface PrintReceiptModalProps {
  visible: boolean;
  receiptOrder: ReceiptOrder | null;
  onClose: () => void;
  /** Dipanggil hanya setelah print benar-benar berhasil dikirim. */
  onPrintSuccess?: () => void;
}

type ModalStep = "preview" | "devices";

/*
|--------------------------------------------------------------------------
| RECEIPT ROW
|--------------------------------------------------------------------------
*/

function ReceiptRow({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={receiptStyles.row}>
      <Text style={[receiptStyles.rowText, bold && receiptStyles.bold]} numberOfLines={1}>{label}</Text>
      <Text style={[receiptStyles.rowText, bold && receiptStyles.bold]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

/*
|--------------------------------------------------------------------------
| RECEIPT PREVIEW
|--------------------------------------------------------------------------
| Ini preview ON-SCREEN saja (React Native <Image>/<Text>), TERPISAH dari
| bitmap logo yang benar-benar dikirim ke printer (lihat logo-raster.ts).
| Tidak ada hubungannya dengan perubahan transport BLE -> Classic Bluetooth.
|--------------------------------------------------------------------------
*/

function ReceiptPreview({ receiptOrder, includeLogo }: { receiptOrder: ReceiptOrder; includeLogo: boolean }) {
  return (
    <View style={receiptStyles.paper}>
      {includeLogo && (
        <Image source={require("@/assets/images/logo.png")} style={receiptStyles.logo} resizeMode="contain" />
      )}

      <Text style={[receiptStyles.storeName, includeLogo && receiptStyles.storeNameBig]}>
        {STORE_INFO.name.toUpperCase()}
      </Text>

      {!!STORE_INFO.address && <Text style={receiptStyles.storeInfo}>{STORE_INFO.address}</Text>}
      {!!STORE_INFO.phone && <Text style={receiptStyles.storeInfo}>{STORE_INFO.phone}</Text>}
      {!!STORE_INFO.instagram && <Text style={receiptStyles.storeInfo}>Instagram: {STORE_INFO.instagram}</Text>}

      <View style={receiptStyles.dashed} />

      <ReceiptRow label="No" value={receiptOrder.orderNumber || "-"} />
      <ReceiptRow label="Tanggal" value={formatReceiptDate(receiptOrder.completedAt)} />
      <ReceiptRow label="Kasir" value={receiptOrder.cashierName || "-"} />
      <ReceiptRow label="Pembayaran" value={getPaymentMethodLabel(receiptOrder.paymentMethod)} />

      <View style={receiptStyles.dashed} />

      {receiptOrder.items.map((item) => {
        const itemName = item.variantName && item.variantName.trim().length > 0
          ? `${item.menuName} (${item.variantName})`
          : item.menuName;

        return (
          <View key={item.id} style={{ marginBottom: 6 }}>
            <Text style={[receiptStyles.rowText, receiptStyles.bold]}>{itemName}</Text>
            <ReceiptRow label={`${formatCurrency(item.unitPrice)} x${item.quantity}`} value={formatCurrency(item.subtotal)} />
          </View>
        );
      })}

      <View style={receiptStyles.dashed} />

      <ReceiptRow label="Subtotal" value={formatCurrency(receiptOrder.subtotal)} />
      {receiptOrder.discount > 0 && <ReceiptRow label="Diskon" value={`-${formatCurrency(receiptOrder.discount)}`} />}
      {receiptOrder.tax > 0 && <ReceiptRow label="Pajak" value={formatCurrency(receiptOrder.tax)} />}

      <ReceiptRow label="TOTAL" value={formatCurrency(receiptOrder.total)} bold />
      <ReceiptRow label="Bayar" value={formatCurrency(receiptOrder.paidAmount)} />
      {receiptOrder.changeAmount > 0 && <ReceiptRow label="Kembali" value={formatCurrency(receiptOrder.changeAmount)} />}

      {!!receiptOrder.notes && receiptOrder.notes.trim().length > 0 && (
        <>
          <View style={receiptStyles.dashed} />
          <Text style={[receiptStyles.rowText, receiptStyles.bold]}>Catatan</Text>
          <Text style={receiptStyles.rowText}>{receiptOrder.notes}</Text>
        </>
      )}

      <View style={receiptStyles.dashed} />
      <Text style={receiptStyles.footerNote}>{STORE_INFO.footerNote}</Text>
    </View>
  );
}

const receiptStyles = StyleSheet.create({
  paper: { width: 260, alignSelf: "center", backgroundColor: "#ffffff", paddingVertical: 16, paddingHorizontal: 14, borderRadius: 4, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  logo: { width: 64, height: 64, alignSelf: "center", marginBottom: 6 },
  storeName: { color: "#000", fontFamily: "monospace", fontWeight: "700", fontSize: 12, textAlign: "center" },
  storeNameBig: { fontSize: 14 },
  storeInfo: { color: "#000", fontFamily: "monospace", fontSize: 10, textAlign: "center" },
  dashed: { borderBottomWidth: 1, borderStyle: "dashed", borderBottomColor: "#000", marginVertical: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  rowText: { color: "#000", fontFamily: "monospace", fontSize: 11, flexShrink: 1 },
  bold: { fontWeight: "700" },
  footerNote: { color: "#000", fontFamily: "monospace", fontSize: 11, fontWeight: "700", textAlign: "center" },
});

/*
|--------------------------------------------------------------------------
| PRINT RECEIPT MODAL
|--------------------------------------------------------------------------
*/

export function PrintReceiptModal({ visible, receiptOrder, onClose, onPrintSuccess }: PrintReceiptModalProps) {
  const colors = useThemeColors();

  const [step, setStep] = useState<ModalStep>("preview");
  const [includeLogo, setIncludeLogo] = useState(true);
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [connectingAddress, setConnectingAddress] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  /*
  |--------------------------------------------------------------------------
  | RESET MODAL
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (visible) {
      setStep("preview");
      setIncludeLogo(true);
      setDevices([]);
      setError(null);
    }
  }, [visible, receiptOrder?.id]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /*
  |--------------------------------------------------------------------------
  | LOAD PAIRED PRINTERS
  |--------------------------------------------------------------------------
  | BEDA dari versi BLE: tidak ada "live scan" 8 detik dengan callback.
  | Printer HARUS sudah di-pair lewat Pengaturan Bluetooth HP dulu, baru
  | muncul di sini. Kalau kosong, kita arahkan user ke Pengaturan Bluetooth.
  |--------------------------------------------------------------------------
  */

  async function loadPairedPrinters() {
    setError(null);

    const granted = await requestBlePermissions();

    if (!granted) {
      setError("Izin Bluetooth ditolak. Aktifkan di pengaturan aplikasi.");
      return;
    }

    const enabled = await isBluetoothEnabled();

    if (!enabled) {
      const turnedOn = await requestEnableBluetooth();

      if (!turnedOn) {
        setError("Bluetooth tidak aktif. Aktifkan Bluetooth terlebih dahulu.");
        return;
      }
    }

    setLoadingDevices(true);

    try {
      const paired = await getPairedPrinters();
      if (mountedRef.current) setDevices(paired);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat daftar printer.");
    } finally {
      if (mountedRef.current) setLoadingDevices(false);
    }
  }

  function goToDeviceSelection() {
    setStep("devices");
    loadPairedPrinters();
  }

  function backToPreview() {
    setStep("preview");
    setError(null);
  }

  /*
  |--------------------------------------------------------------------------
  | PRINT
  |--------------------------------------------------------------------------
  */

  async function printToDevice(address: string) {
    if (!receiptOrder) return;

    setError(null);
    setPrinting(true);

    try {
      await connectToPrinter(address);

      let logoRaster = null;
      if (includeLogo) logoRaster = await getLogoRaster();

      const data = buildReceiptEscPos(receiptOrder, { includeLogo, logoRaster });

      await printReceiptBytes(data);

      onPrintSuccess?.();
      onClose();
    } catch (err) {
      console.error("Print receipt error:", err);
      setError(err instanceof Error ? err.message : "Gagal mencetak struk.");
      setStep("devices");
    } finally {
      setPrinting(false);
      setConnectingAddress(null);
    }
  }

  async function handlePrintPress() {
    if (!receiptOrder || printing) return;

    // Kalau sudah ada printer yang connected, langsung print.
    const connectedAddress = getConnectedDeviceId();

    if (isPrinterConnected() && connectedAddress) {
      await printToDevice(connectedAddress);
      return;
    }

    goToDeviceSelection();
  }

  async function handleSelectPrinter(device: BluetoothDevice) {
    setConnectingAddress(device.address);
    await printToDevice(device.address);
  }

  /*
  |--------------------------------------------------------------------------
  | RENDER
  |--------------------------------------------------------------------------
  */

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.bg, borderColor: colors.border }]}>
          {/* HEADER */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]}>
                {step === "preview" ? "Struk Pembayaran" : "Pilih Printer"}
              </Text>

              {!!receiptOrder && (
                <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>
                  Pesanan {receiptOrder.orderNumber}
                </Text>
              )}
            </View>

            {step === "devices" && (
              <TouchableOpacity onPress={backToPreview} style={{ marginRight: 12 }}>
                <Ionicons name="arrow-back" size={20} color={colors.text} />
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {error && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={{ color: colors.danger, marginLeft: 6, flex: 1 }}>{error}</Text>
              </View>
            )}

            {/* ============================================================ */}
            {/* PREVIEW */}
            {/* ============================================================ */}

            {step === "preview" && receiptOrder && (
              <>
                <ReceiptPreview receiptOrder={receiptOrder} includeLogo={includeLogo} />

                <View style={[styles.toggleRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>Cantumkan Logo di Struk</Text>
                  <Switch
                    value={includeLogo}
                    onValueChange={setIncludeLogo}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor="#fff"
                  />
                </View>

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.secondaryBtn, { borderColor: colors.border }]}
                    onPress={onClose}
                    disabled={printing}
                  >
                    <Text style={{ color: colors.text, fontWeight: "600" }}>Tutup</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                    onPress={handlePrintPress}
                    disabled={printing}
                  >
                    {printing ? (
                      <ActivityIndicator color={colors.bg} />
                    ) : (
                      <>
                        <Ionicons name="print-outline" size={16} color={colors.bg} />
                        <Text style={{ color: colors.bg, fontWeight: "700", marginLeft: 6 }}>Cetak Struk (58mm)</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* ============================================================ */}
            {/* DEVICES */}
            {/* ============================================================ */}

            {step === "devices" && (
              <>
                <Text style={{ color: colors.subtext, marginBottom: 12 }}>
                  Pilih printer thermal Bluetooth (58mm) yang sudah di-pair dengan HP ini.
                </Text>

                {devices.length === 0 ? (
                  <View style={{ paddingVertical: 24, alignItems: "center" }}>
                    {loadingDevices ? (
                      <>
                        <ActivityIndicator color={colors.primary} />
                        <Text style={{ color: colors.subtext, marginTop: 8 }}>Memuat daftar printer...</Text>
                      </>
                    ) : (
                      <>
                        <Ionicons name="bluetooth-outline" size={28} color={colors.subtext} />
                        <Text style={{ color: colors.subtext, marginTop: 8, textAlign: "center" }}>
                          Belum ada printer yang di-pair.{"\n"}Pair printer dulu lewat Pengaturan Bluetooth HP.
                        </Text>

                        <TouchableOpacity
                          style={[styles.settingsBtn, { borderColor: colors.border }]}
                          onPress={openBluetoothSettings}
                        >
                          <Ionicons name="settings-outline" size={16} color={colors.text} />
                          <Text style={{ color: colors.text, marginLeft: 6 }}>Buka Pengaturan Bluetooth</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                ) : (
                  devices.map((item) => (
                    <TouchableOpacity
                      key={item.address}
                      style={[styles.deviceRow, { borderColor: colors.border, backgroundColor: colors.card }]}
                      onPress={() => handleSelectPrinter(item)}
                      disabled={connectingAddress !== null || printing}
                    >
                      <Ionicons name="bluetooth-outline" size={18} color={colors.primary} />
                      <Text style={{ color: colors.text, flex: 1, marginLeft: 10 }}>{item.name ?? "Printer Tanpa Nama"}</Text>

                      {connectingAddress === item.address ? (
                        <ActivityIndicator color={colors.primary} size="small" />
                      ) : (
                        <Ionicons name="chevron-forward" size={18} color={colors.subtext} />
                      )}
                    </TouchableOpacity>
                  ))
                )}

                <TouchableOpacity
                  style={[styles.rescanBtn, { borderColor: colors.border }]}
                  onPress={loadPairedPrinters}
                  disabled={loadingDevices}
                >
                  <Ionicons name="refresh" size={16} color={colors.text} />
                  <Text style={{ color: colors.text, marginLeft: 6 }}>Muat Ulang</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/*
|--------------------------------------------------------------------------
| MODAL STYLE
|--------------------------------------------------------------------------
*/

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, padding: 20, paddingBottom: 32, maxHeight: "88%" },
  header: { flexDirection: "row", alignItems: "flex-start", marginBottom: 14 },
  title: { fontSize: 17, fontWeight: "700" },
  errorBox: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(239,68,68,0.08)", borderRadius: 8, padding: 10, marginBottom: 12 },
  toggleRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 16 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  secondaryBtn: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  primaryBtn: { flex: 1.4, flexDirection: "row", borderRadius: 10, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  deviceRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  rescanBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 10, paddingVertical: 10, marginTop: 8 },
  settingsBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, marginTop: 14 },
});