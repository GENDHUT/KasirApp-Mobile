import { BleManager, Device, Characteristic } from "react-native-ble-plx";
import { PermissionsAndroid, Platform } from "react-native";

/*
|--------------------------------------------------------------------------
| THERMAL PRINTER (BLE NATIVE, ESC/POS, 58MM) -- VERSI EXPO
|--------------------------------------------------------------------------
| Pengganti Web Bluetooth di versi web. react-native-ble-plx = native
| module -> WAJIB dev client / EAS build, TIDAK JALAN di Expo Go.
|
| FIX PENTING dibanding versi sebelumnya (struk keluar rusak/pendek):
|
| 1. MTU NEGOTIATION -- default ATT MTU BLE cuma 23 byte (20 byte payload).
|    Kalau kita kirim chunk 180 byte tanpa minta MTU lebih besar dulu,
|    kelebihannya DIAM-DIAM DIBUANG oleh OS (khusus write "without
|    response" yang memang tanpa acknowledgment). Karena command raster
|    logo (GS v 0) itu strict soal jumlah byte, begitu ada yang hilang di
|    tengah, parser printer langsung out-of-sync -> sisa print jadi acak.
|
| 2. WRITE-MODE FALLBACK -- versi web sudah punya fallback antara
|    writeValueWithoutResponse() vs writeValue(); versi native sebelumnya
|    hardcode "without response" tanpa cek characteristic-nya benar2
|    support itu atau tidak.
|--------------------------------------------------------------------------
*/

const PRINTER_SERVICE_UUID = "000018f0-0000-1000-8000-00805f9b34fb";
const PRINTER_CHARACTERISTIC_UUID = "00002af1-0000-1000-8000-00805f9b34fb";

const REQUESTED_MTU = 247; // umum didukung modul BLE printer generik (Nordic/ESP32 based)
const DEFAULT_CHUNK_SIZE = 180;
const MIN_CHUNK_SIZE = 20; // ATT MTU default 23 byte - 3 byte header ATT = 20 byte payload aman
const CHUNK_DELAY_MS = 12;

const manager = new BleManager();

let cachedDevice: Device | null = null;
let cachedCharacteristic: Characteristic | null = null;
let cachedChunkSize = MIN_CHUNK_SIZE;
let cachedWriteWithResponse = false;

/*
|--------------------------------------------------------------------------
| PERMISSION (ANDROID)
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
| SCAN
|--------------------------------------------------------------------------
*/

export function scanForPrinters(onFound: (device: Device) => void, onError?: (message: string) => void, timeoutMs = 8000) {
  const seen = new Set<string>();

  manager.startDeviceScan([PRINTER_SERVICE_UUID], { allowDuplicates: false }, (error, device) => {
    if (error) {
      onError?.(error.message);
      return;
    }

    if (!device || seen.has(device.id)) return;

    seen.add(device.id);
    onFound(device);
  });

  const timeout = setTimeout(() => manager.stopDeviceScan(), timeoutMs);

  return () => {
    clearTimeout(timeout);
    manager.stopDeviceScan();
  };
}

export function stopScan() {
  manager.stopDeviceScan();
}

/*
|--------------------------------------------------------------------------
| CONNECT / DISCONNECT
|--------------------------------------------------------------------------
*/

export async function connectToPrinter(deviceId: string): Promise<Device> {
  if (cachedDevice && cachedDevice.id === deviceId) {
    const stillConnected = await cachedDevice.isConnected().catch(() => false);
    if (stillConnected) return cachedDevice;
  }

  const device = await manager.connectToDevice(deviceId, { autoConnect: false });
  await device.discoverAllServicesAndCharacteristics();

  // 1) NEGOSIASI MTU -- Android only, iOS auto-negosiasi ~185 & requestMTU no-op di sana.
  let negotiatedMtu = 23;

  if (Platform.OS === "android") {
    try {
      const mtuDevice = await device.requestMTU(REQUESTED_MTU);
      negotiatedMtu = mtuDevice.mtu ?? 23;
    } catch {
      negotiatedMtu = 23; // printer/HP tidak support MTU besar -> fallback aman
    }
  } else {
    negotiatedMtu = 185;
  }

  cachedChunkSize = Math.max(MIN_CHUNK_SIZE, Math.min(DEFAULT_CHUNK_SIZE, negotiatedMtu - 3));

  // 2) CEK KAPABILITAS CHARACTERISTIC -- pilih write-mode yang benar2 didukung,
  //    sama seperti fallback yang sudah ada di versi web.
  const characteristics = await device.characteristicsForService(PRINTER_SERVICE_UUID).catch(() => []);
  const target = characteristics.find((c) => c.uuid.toLowerCase() === PRINTER_CHARACTERISTIC_UUID.toLowerCase()) ?? null;

  cachedCharacteristic = target;
  cachedWriteWithResponse = !!target && !target.isWritableWithoutResponse && target.isWritableWithResponse;

  device.onDisconnected(() => {
    if (cachedDevice?.id === deviceId) {
      cachedDevice = null;
      cachedCharacteristic = null;
    }
  });

  cachedDevice = device;
  return device;
}

export async function disconnectPrinter() {
  if (cachedDevice) {
    await manager.cancelDeviceConnection(cachedDevice.id).catch(() => {});
    cachedDevice = null;
    cachedCharacteristic = null;
  }
}

export function getConnectedPrinterName(): string | null {
  return cachedDevice ? cachedDevice.name ?? "Printer" : null;
}

export function isPrinterConnected(): boolean {
  return !!cachedDevice;
}

export function getConnectedDeviceId(): string | null {
  return cachedDevice ? cachedDevice.id : null;
}

/*
|--------------------------------------------------------------------------
| BASE64 ENCODER (TANPA DEPENDENCY TAMBAHAN)
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
| WRITE (CHUNKED, MTU-AWARE) + PRINT
|--------------------------------------------------------------------------
*/

async function writeChunk(device: Device, chunk: Uint8Array) {
  const base64Chunk = bytesToBase64(chunk);

  if (cachedWriteWithResponse) {
    await device.writeCharacteristicWithResponseForService(PRINTER_SERVICE_UUID, PRINTER_CHARACTERISTIC_UUID, base64Chunk);
  } else {
    await device.writeCharacteristicWithoutResponseForService(PRINTER_SERVICE_UUID, PRINTER_CHARACTERISTIC_UUID, base64Chunk);
  }
}

export async function printReceiptBytes(data: Uint8Array) {
  if (!cachedDevice) {
    throw new Error("Printer belum terhubung. Sambungkan printer terlebih dahulu.");
  }

  const chunkSize = cachedChunkSize || MIN_CHUNK_SIZE;

  for (let offset = 0; offset < data.length; offset += chunkSize) {
    const chunk = data.slice(offset, offset + chunkSize);
    await writeChunk(cachedDevice, chunk);
    await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
  }
}

export function destroyBleManager() {
  manager.destroy();
}