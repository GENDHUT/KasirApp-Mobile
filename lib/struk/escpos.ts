import { ReceiptOrder, STORE_INFO, formatCurrency, formatReceiptDate, getPaymentMethodLabel } from "./receipt-types";
import { type LogoRaster } from "./logo-raster";

/*
|--------------------------------------------------------------------------
| ESC/POS RECEIPT BUILDER
|--------------------------------------------------------------------------
| Expo / React Native -- Bluetooth Thermal Printer 58mm. Output: Uint8Array
|--------------------------------------------------------------------------
*/

const LINE_WIDTH = 32;
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const CMD = {
  INIT: [ESC, 0x40],
  SELECT_CODEPAGE_PC437: [ESC, 0x74, 0x00],
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  ALIGN_RIGHT: [ESC, 0x61, 0x02],
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  NORMAL_SIZE: [GS, 0x21, 0x00],
  DOUBLE_SIZE: [GS, 0x21, 0x11],
  RASTER_IMAGE_PREFIX: [GS, 0x76, 0x30, 0x00], // GS v 0 -> 1D 76 30 m xL xH yL yH data...
  FEED_LINE: [LF],
  CUT: [GS, 0x56, 0x00],
};

function encodeText(text: string): number[] {
  const result: number[] = [];

  for (const char of text) {
    let code = char.charCodeAt(0);

    if (code === 0xa0) code = 0x20; // NBSP -> spasi biasa (fix garbled di printer)

    result.push(code >= 0 && code <= 255 ? code : 0x3f);
  }

  return result;
}

/*
|--------------------------------------------------------------------------
| RECEIPT BUILDER
|--------------------------------------------------------------------------
*/

class ReceiptBuilder {
  private bytes: number[] = [];

  push(command: number[]) {
    this.bytes.push(...command);
    return this;
  }

  pushRaw(bytes: Uint8Array) {
    for (let i = 0; i < bytes.length; i++) this.bytes.push(bytes[i]);
    return this;
  }

  rasterImage(raster: LogoRaster) {
    const { widthBytes, height, data } = raster;

    this.push([...CMD.RASTER_IMAGE_PREFIX, widthBytes & 0xff, (widthBytes >> 8) & 0xff, height & 0xff, (height >> 8) & 0xff]);
    this.pushRaw(data);

    return this;
  }

  text(value: string) {
    this.bytes.push(...encodeText(value));
    return this;
  }

  line(value = "") {
    this.text(value);
    this.push(CMD.FEED_LINE);
    return this;
  }

  left() { this.push(CMD.ALIGN_LEFT); return this; }
  center() { this.push(CMD.ALIGN_CENTER); return this; }
  right() { this.push(CMD.ALIGN_RIGHT); return this; }

  bold(enabled: boolean) { this.push(enabled ? CMD.BOLD_ON : CMD.BOLD_OFF); return this; }
  big(enabled: boolean) { this.push(enabled ? CMD.DOUBLE_SIZE : CMD.NORMAL_SIZE); return this; }

  dashedLine() {
    this.left();
    this.line("-".repeat(LINE_WIDTH));
    return this;
  }

  row(label: string, value: string) {
    const safeLabel = String(label ?? "");
    const safeValue = String(value ?? "");

    if (safeValue.length >= LINE_WIDTH) {
      this.line(safeLabel);
      this.rightAligned(safeValue);
      return this;
    }

    const maxLabelLength = LINE_WIDTH - safeValue.length - 1;
    let clippedLabel = safeLabel;

    if (clippedLabel.length > maxLabelLength) {
      clippedLabel = maxLabelLength > 1
        ? clippedLabel.slice(0, maxLabelLength - 1) + "."
        : clippedLabel.slice(0, maxLabelLength);
    }

    const spaces = Math.max(1, LINE_WIDTH - clippedLabel.length - safeValue.length);
    this.line(clippedLabel + " ".repeat(spaces) + safeValue);

    return this;
  }

  rightAligned(value: string) {
    const safeValue = String(value ?? "");

    if (safeValue.length >= LINE_WIDTH) {
      this.line(safeValue.slice(0, LINE_WIDTH));
      return this;
    }

    const spaces = LINE_WIDTH - safeValue.length;
    this.line(" ".repeat(Math.max(0, spaces)) + safeValue);

    return this;
  }

  wrapped(value: string) {
    const text = String(value ?? "").trim();

    if (!text) {
      this.line();
      return this;
    }

    const words = text.split(/\s+/);
    let current = "";

    for (const word of words) {
      if (word.length > LINE_WIDTH) {
        if (current) {
          this.line(current);
          current = "";
        }

        for (let i = 0; i < word.length; i += LINE_WIDTH) this.line(word.slice(i, i + LINE_WIDTH));

        continue;
      }

      const candidate = current ? `${current} ${word}` : word;

      if (candidate.length > LINE_WIDTH && current) {
        this.line(current);
        current = word;
      } else {
        current = candidate;
      }
    }

    if (current) this.line(current);

    return this;
  }

  raw(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/*
|--------------------------------------------------------------------------
| BUILD RECEIPT
|--------------------------------------------------------------------------
*/

export interface BuildReceiptOptions {
  /** Tampilkan logo. Default: true. */
  includeLogo?: boolean;
  /** Bitmap logo hasil dari logo-raster.ts. */
  logoRaster?: LogoRaster | null;
}

export function buildReceiptEscPos(order: ReceiptOrder, options: BuildReceiptOptions = {}): Uint8Array {
  const { includeLogo = true, logoRaster = null } = options;
  const b = new ReceiptBuilder();

  // INIT
  b.push(CMD.INIT).push(CMD.SELECT_CODEPAGE_PC437).push(CMD.NORMAL_SIZE);

  // HEADER -- logo (kalau ada) selalu paling atas, baru nama toko
  b.center();

  if (includeLogo && logoRaster) {
    b.rasterImage(logoRaster).line();
    b.big(false).bold(false);
  }

  b.bold(true);
  b.big(includeLogo && logoRaster ? false : includeLogo); // tanpa logo, nama toko dibuat lebih besar
  b.line(STORE_INFO.name.toUpperCase());
  b.big(false).bold(false);

  if (STORE_INFO.address) b.wrapped(STORE_INFO.address);
  if (STORE_INFO.phone) b.wrapped(STORE_INFO.phone);
  if (STORE_INFO.instagram) b.wrapped(`Instagram: ${STORE_INFO.instagram}`);
  b.line();

  // ORDER META
  b.dashedLine().left();
  b.row("No", order.orderNumber || "-");
  b.row("Tanggal", formatReceiptDate(order.completedAt));
  b.row("Kasir", order.cashierName || "-");
  b.row("Pembayaran", getPaymentMethodLabel(order.paymentMethod));
  b.dashedLine();

  // ITEMS
  for (const item of order.items) {
    const itemName = item.variantName && item.variantName.trim().length > 0
      ? `${item.menuName} (${item.variantName})`
      : item.menuName;

    b.bold(true).wrapped(itemName).bold(false);
    b.row(`${formatCurrency(item.unitPrice)} x${item.quantity}`, formatCurrency(item.subtotal));
  }

  // TOTAL
  b.dashedLine();
  b.row("Subtotal", formatCurrency(order.subtotal));
  if (order.discount > 0) b.row("Diskon", `-${formatCurrency(order.discount)}`);
  if (order.tax > 0) b.row("Pajak", formatCurrency(order.tax));

  b.bold(true).row("TOTAL", formatCurrency(order.total)).bold(false);

  b.row("Bayar", formatCurrency(order.paidAmount));
  if (order.changeAmount > 0) b.row("Kembali", formatCurrency(order.changeAmount));

  // NOTES
  if (order.notes && order.notes.trim().length > 0) {
    b.dashedLine();
    b.bold(true).line("Catatan").bold(false);
    b.wrapped(order.notes);
  }

  // FOOTER
  b.dashedLine().center();
  b.bold(true).wrapped(STORE_INFO.footerNote).bold(false);

  // FEED + CUT
  b.line().line().line().line();
  b.push(CMD.CUT);

  return b.raw();
}