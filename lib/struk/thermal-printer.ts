import { BleManager, Device } from "react-native-ble-plx";
import { PermissionsAndroid, Platform } from "react-native";

/*
|--------------------------------------------------------------------------
| THERMAL PRINTER (BLE NATIVE, ESC/POS, 58MM) -- VERSI EXPO
|--------------------------------------------------------------------------
|
| Pengganti Web Bluetooth di versi web. react-native-ble-plx = native
| module -> WAJIB dev client / EAS build, TIDAK JALAN di Expo Go.
|
*/

const PRINTER_SERVICE_UUID = "000018f0-0000-1000-8000-00805f9b34fb";
const PRINTER_CHARACTERISTIC_UUID = "00002af1-0000-1000-8000-00805f9b34fb";

const CHUNK_SIZE = 180;
const CHUNK_DELAY_MS = 12;

const manager = new BleManager();

let cachedDevice: Device | null = null;

/*
|--------------------------------------------------------------------------
| PERMISSION (ANDROID)
|--------------------------------------------------------------------------
*/

export async function requestBlePermissions(): Promise<boolean> {
    if (Platform.OS !== "android") {
        return true;
    }

    const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);

    return Object.values(result).every(
        (status) => status === PermissionsAndroid.RESULTS.GRANTED
    );
}

/*
|--------------------------------------------------------------------------
| SCAN
|--------------------------------------------------------------------------
*/

export function scanForPrinters(
    onFound: (device: Device) => void,
    onError?: (message: string) => void,
    timeoutMs = 8000
) {
    const seen = new Set<string>();

    manager.startDeviceScan(
        [PRINTER_SERVICE_UUID],
        { allowDuplicates: false },
        (error, device) => {
            if (error) {
                onError?.(error.message);
                return;
            }

            if (!device || seen.has(device.id)) {
                return;
            }

            seen.add(device.id);
            onFound(device);
        }
    );

    const timeout = setTimeout(() => {
        manager.stopDeviceScan();
    }, timeoutMs);

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
        if (stillConnected) {
            return cachedDevice;
        }
    }

    const device = await manager.connectToDevice(deviceId, {
        autoConnect: false,
    });

    await device.discoverAllServicesAndCharacteristics();

    device.onDisconnected(() => {
        if (cachedDevice?.id === deviceId) {
            cachedDevice = null;
        }
    });

    cachedDevice = device;
    return device;
}

export async function disconnectPrinter() {
    if (cachedDevice) {
        await manager.cancelDeviceConnection(cachedDevice.id).catch(() => {});
        cachedDevice = null;
    }
}

export function getConnectedPrinterName(): string | null {
    return cachedDevice ? cachedDevice.name ?? "Printer" : null;
}

export function isPrinterConnected(): boolean {
    return !!cachedDevice;
}

/*
|--------------------------------------------------------------------------
| BASE64 ENCODER (TANPA DEPENDENCY TAMBAHAN)
|--------------------------------------------------------------------------
*/

const BASE64_CHARS =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

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
| WRITE (CHUNKED)
|--------------------------------------------------------------------------
*/

async function writeChunk(device: Device, chunk: Uint8Array) {
    const base64Chunk = bytesToBase64(chunk);

    await device.writeCharacteristicWithoutResponseForService(
        PRINTER_SERVICE_UUID,
        PRINTER_CHARACTERISTIC_UUID,
        base64Chunk
    );
}

/*
|--------------------------------------------------------------------------
| PRINT
|--------------------------------------------------------------------------
*/

export async function printReceiptBytes(data: Uint8Array) {
    if (!cachedDevice) {
        throw new Error(
            "Printer belum terhubung. Sambungkan printer terlebih dahulu."
        );
    }

    for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
        const chunk = data.slice(offset, offset + CHUNK_SIZE);
        await writeChunk(cachedDevice, chunk);
        await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
    }
}

export function destroyBleManager() {
    manager.destroy();
}