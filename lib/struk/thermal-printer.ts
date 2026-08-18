import RNBluetoothClassic, { BluetoothDevice } from "react-native-bluetooth-classic";
import { PermissionsAndroid, Platform } from "react-native";

/*
|--------------------------------------------------------------------------
| THERMAL PRINTER (BLUETOOTH CLASSIC / RFCOMM, ESC/POS, 58MM) -- VERSI EXPO
|--------------------------------------------------------------------------
| GANTI TOTAL dari versi BLE (react-native-ble-plx) ke Bluetooth Classic
| (react-native-bluetooth-classic).
|
| KENAPA DIGANTI:
| Printer thermal 58mm generik/clone itu historisnya didesain untuk
| Bluetooth Classic (SPP / serial socket), BUKAN BLE. BLE GATT di printer
| model ini seringkali cuma "tempelan" kompatibilitas yang implementasinya
| tidak stabil di board murah -- itu kenapa fix BLE (MTU negotiation,
| write-mode fallback) TIDAK memberi perbaikan sama sekali: kita
| membenarkan hal yang salah, transport-nya sendiri yang tidak cocok.
|
| Bluetooth Classic (RFCOMM) itu cuma pipa serial biasa -- streaming byte
| berkelanjutan tanpa batas paket kecil ala ATT MTU di BLE. Tidak ada lagi
| urusan chunk-size/MTU sama sekali.
|
| CATATAN PENTING -- BEDA ALUR DARI BLE:
| Printer HARUS sudah di-PAIR dulu lewat Pengaturan Bluetooth Android
| (Settings > Bluetooth > pair perangkat baru) sebelum muncul di
| getPairedPrinters(). Ini standar untuk Bluetooth Classic, beda dengan
| BLE yang bisa langsung connect tanpa pairing OS.
|--------------------------------------------------------------------------
*/

// PENTING: field ini HARUS persis "connectorType" (camelCase), BUKAN
// "CONNECTOR_TYPE" -- dokumentasi resmi library ini sempat menampilkan
// versi uppercase di teks, tapi definisi TypeScript (StandardOptions)
// yang sebenarnya pakai camelCase untuk field ini. DELIMITER dan
// DEVICE_CHARSET tetap uppercase, sudah benar.
const CONNECTION_OPTIONS = {
  connectorType: "rfcomm",
  DELIMITER: "\n",
  DEVICE_CHARSET: Platform.OS === "ios" ? 1536 : "utf-8",
};

const WRITE_CHUNK_SIZE = 1024; // RFCOMM jauh lebih longgar dari BLE, tapi tetap dicicil biar aman di bridge RN
const CHUNK_DELAY_MS = 8;

let cachedDevice: BluetoothDevice | null = null;

/*
|--------------------------------------------------------------------------
| PERMISSION (ANDROID)
|--------------------------------------------------------------------------
| Sama seperti sebelumnya -- Android 12+ (API 31+) menyatukan izin runtime
| Bluetooth Classic & BLE di bawah payung yang sama.
|--------------------------------------------------------------------------
*/

export async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;

  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  ]);

  return Object.values(result).every((status) => status === PermissionsAndroid.RESULTS.GRANTED);
}

/*
|--------------------------------------------------------------------------
| BLUETOOTH ADAPTER STATE
|--------------------------------------------------------------------------
*/

export async function isBluetoothEnabled(): Promise<boolean> {
  return RNBluetoothClassic.isBluetoothEnabled().catch(() => false);
}

export async function requestEnableBluetooth(): Promise<boolean> {
  return RNBluetoothClassic.requestBluetoothEnabled().catch(() => false);
}

export function openBluetoothSettings() {
  if (Platform.OS === "android") RNBluetoothClassic.openBluetoothSettings();
}

/*
|--------------------------------------------------------------------------
| DAFTAR PRINTER
|--------------------------------------------------------------------------
| BEDA KONSEP dari BLE: tidak ada "live scan" dengan callback per device
| ditemukan. Yang ada:
|
| 1. getPairedPrinters()  -> printer yang SUDAH di-pair di OS (paling umum
|    dipakai, karena user biasanya pairing sekali lewat Pengaturan HP).
| 2. discoverPrinters()   -> cari printer yang BELUM di-pair (Android only,
|    butuh izin lokasi), lalu pairPrinter() dulu sebelum bisa connect.
|--------------------------------------------------------------------------
*/

export async function getPairedPrinters(): Promise<BluetoothDevice[]> {
  return RNBluetoothClassic.getBondedDevices().catch(() => []);
}

export async function discoverPrinters(): Promise<BluetoothDevice[]> {
  if (Platform.OS !== "android") return [];
  return RNBluetoothClassic.startDiscovery().catch(() => []);
}

export async function cancelDiscovery() {
  if (Platform.OS === "android") await RNBluetoothClassic.cancelDiscovery().catch(() => {});
}

export async function pairPrinter(address: string): Promise<BluetoothDevice | null> {
  if (Platform.OS !== "android") return null;
  return RNBluetoothClassic.pairDevice(address).catch(() => null);
}

/*
|--------------------------------------------------------------------------
| CONNECT / DISCONNECT
|--------------------------------------------------------------------------
*/

export async function connectToPrinter(address: string): Promise<BluetoothDevice> {
  const paired = await RNBluetoothClassic.getBondedDevices();
  const target = paired.find((d) => d.address === address);

  if (!target) {
    throw new Error("Printer belum di-pair. Pair printer dulu lewat Pengaturan Bluetooth HP.");
  }

  const alreadyConnected = await target.isConnected().catch(() => false);
  if (!alreadyConnected) await target.connect(CONNECTION_OPTIONS);

  cachedDevice = target;
  return target;
}

export async function disconnectPrinter() {
  if (cachedDevice) {
    await cachedDevice.disconnect().catch(() => {});
    cachedDevice = null;
  }
}

export function getConnectedPrinterName(): string | null {
  return cachedDevice ? cachedDevice.name ?? "Printer" : null;
}

export function isPrinterConnected(): boolean {
  return !!cachedDevice;
}

export function getConnectedDeviceId(): string | null {
  return cachedDevice ? cachedDevice.address : null;
}

/*
|--------------------------------------------------------------------------
| BASE64 ENCODER (TANPA DEPENDENCY TAMBAHAN)
|--------------------------------------------------------------------------
| Tetap dipakai: device.write() butuh data di-base64 dulu di sisi kita,
| baru dikasih tau encoding-nya "base64" supaya native side decode balik
| ke bytes mentah sebelum dikirim ke socket.
|--------------------------------------------------------------------------
*/

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function bytesToBase64(bytes: Uint8Array): string {
  let result = "";
  let i = 0;

  for (; i + 2 < bytes.length; i += 3) {
    result += BASE64_CHARS[bytes[i] >> 2];
    result += BASE64_CHARS[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
    result += BASE64_CHARS[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
    result += BASE64_CHARS[bytes[i + 2] & 63];
  }

  const remaining = bytes.length - i;

  if (remaining === 1) {
    result += BASE64_CHARS[bytes[i] >> 2];
    result += BASE64_CHARS[(bytes[i] & 3) << 4];
    result += "==";
  } else if (remaining === 2) {
    result += BASE64_CHARS[bytes[i] >> 2];
    result += BASE64_CHARS[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
    result += BASE64_CHARS[(bytes[i + 1] & 15) << 2];
    result += "=";
  }

  return result;
}

/*
|--------------------------------------------------------------------------
| PRINT
|--------------------------------------------------------------------------
| RFCOMM tidak punya batas MTU kecil kayak BLE, jadi tidak ada lagi resiko
| byte kepotong diam-diam. Tetap dicicil per WRITE_CHUNK_SIZE murni supaya
| bridge RN tidak dibebani base64 string raksasa sekaligus (bukan karena
| ada batas protokol seperti BLE dulu).
|--------------------------------------------------------------------------
*/

export async function printReceiptBytes(data: Uint8Array) {
  if (!cachedDevice) {
    throw new Error("Printer belum terhubung. Sambungkan printer terlebih dahulu.");
  }

  for (let offset = 0; offset < data.length; offset += WRITE_CHUNK_SIZE) {
    const chunk = data.slice(offset, offset + WRITE_CHUNK_SIZE);
    const base64Chunk = bytesToBase64(chunk);

    await cachedDevice.write(base64Chunk, "base64");

    if (offset + WRITE_CHUNK_SIZE < data.length) {
      await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
    }
  }
}

/**
 * Disimpan sebagai no-op supaya kode lama yang masih memanggil
 * destroyBleManager() (mis. di cleanup/unmount) tidak crash. Bluetooth
 * Classic tidak butuh manager instance yang perlu di-destroy seperti
 * BleManager dulu.
 */
export function destroyBleManager() {}