import {
  ReceiptOrder,
  STORE_INFO,
  formatCurrency,
  formatReceiptDate,
  getPaymentMethodLabel,
} from "./receipt-types";

/*
|--------------------------------------------------------------------------
| ESC/POS RECEIPT BUILDER
|--------------------------------------------------------------------------
|
| Untuk:
| - Expo
| - React Native
| - Bluetooth Thermal Printer
| - Printer 58mm
|
| Tidak menggunakan:
| - DOM
| - Canvas
| - Browser API
|
| Output:
| Uint8Array
|
|--------------------------------------------------------------------------
*/

const LINE_WIDTH = 32;

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/*
|--------------------------------------------------------------------------
| ESC/POS COMMANDS
|--------------------------------------------------------------------------
*/

const CMD = {
  INIT: [ESC, 0x40],

  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  ALIGN_RIGHT: [ESC, 0x61, 0x02],

  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],

  /*
   * GS ! n
   *
   * 0x00 = normal
   * 0x11 = double width + double height
   */
  NORMAL_SIZE: [GS, 0x21, 0x00],
  DOUBLE_SIZE: [GS, 0x21, 0x11],

  FEED_LINE: [LF],

  /*
   * Full cut.
   *
   * Tidak semua printer mendukung command ini.
   */
  CUT: [GS, 0x56, 0x00],
};

/*
|--------------------------------------------------------------------------
| TEXT ENCODING
|--------------------------------------------------------------------------
*/

/**
 * Encode text untuk printer thermal.
 *
 * Banyak printer thermal murah menggunakan single-byte
 * encoding/codepage, bukan UTF-8.
 *
 * Karena itu untuk tahap aman kita gunakan karakter ASCII.
 *
 * Karakter di luar 0-255 akan diganti dengan "?".
 */
function encodeText(text: string): number[] {
  const result: number[] = [];

  for (const char of text) {
    const code = char.charCodeAt(0);

    if (code >= 0 && code <= 255) {
      result.push(code);
    } else {
      result.push(0x3f); // ?
    }
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

  /**
   * Tambahkan raw ESC/POS command.
   *
   * Public karena buildReceiptEscPos() membutuhkan command
   * INIT dan CUT.
   */
  push(command: number[]) {
    this.bytes.push(...command);

    return this;
  }

  /**
   * Tambahkan text tanpa line feed.
   */
  text(value: string) {
    this.bytes.push(...encodeText(value));

    return this;
  }

  /**
   * Tambahkan text + newline.
   */
  line(value = "") {
    this.text(value);
    this.push(CMD.FEED_LINE);

    return this;
  }

  /**
   * Align kiri.
   */
  left() {
    this.push(CMD.ALIGN_LEFT);

    return this;
  }

  /**
   * Align tengah.
   */
  center() {
    this.push(CMD.ALIGN_CENTER);

    return this;
  }

  /**
   * Align kanan.
   */
  right() {
    this.push(CMD.ALIGN_RIGHT);

    return this;
  }

  /**
   * Bold.
   */
  bold(enabled: boolean) {
    this.push(
      enabled
        ? CMD.BOLD_ON
        : CMD.BOLD_OFF
    );

    return this;
  }

  /**
   * Ukuran text normal / double.
   */
  big(enabled: boolean) {
    this.push(
      enabled
        ? CMD.DOUBLE_SIZE
        : CMD.NORMAL_SIZE
    );

    return this;
  }

  /**
   * Garis horizontal.
   */
  dashedLine() {
    this.left();
    this.line("-".repeat(LINE_WIDTH));

    return this;
  }

  /**
   * Membuat row:
   *
   * Total                 Rp20.000
   */
  row(label: string, value: string) {
    const safeLabel = String(label ?? "");
    const safeValue = String(value ?? "");

    /*
     * Jika value terlalu panjang,
     * jangan sampai melebihi lebar printer.
     */
    if (safeValue.length >= LINE_WIDTH) {
      this.line(safeLabel);
      this.rightAligned(safeValue);

      return this;
    }

    const maxLabelLength =
      LINE_WIDTH - safeValue.length - 1;

    let clippedLabel = safeLabel;

    if (clippedLabel.length > maxLabelLength) {
      clippedLabel =
        maxLabelLength > 1
          ? clippedLabel.slice(0, maxLabelLength - 1) + "."
          : clippedLabel.slice(0, maxLabelLength);
    }

    const spaces = Math.max(
      1,
      LINE_WIDTH -
        clippedLabel.length -
        safeValue.length
    );

    this.line(
      clippedLabel +
        " ".repeat(spaces) +
        safeValue
    );

    return this;
  }

  /**
   * Text rata kanan.
   */
  rightAligned(value: string) {
    const safeValue = String(value ?? "");

    if (safeValue.length >= LINE_WIDTH) {
      this.line(safeValue.slice(0, LINE_WIDTH));

      return this;
    }

    const spaces =
      LINE_WIDTH - safeValue.length;

    this.line(
      " ".repeat(Math.max(0, spaces)) +
        safeValue
    );

    return this;
  }

  /**
   * Wrap text ke beberapa baris.
   *
   * Mendukung:
   *
   * "Ayam Geprek Super Pedas"
   *
   * menjadi:
   *
   * Ayam Geprek Super Pedas
   */
  wrapped(value: string) {
    const text = String(value ?? "").trim();

    if (!text) {
      this.line();
      return this;
    }

    /*
     * Pecah berdasarkan whitespace.
     */
    const words = text.split(/\s+/);

    let current = "";

    for (const word of words) {
      /*
       * Kalau satu kata saja lebih panjang
       * dari LINE_WIDTH, pecah paksa.
       */
      if (word.length > LINE_WIDTH) {
        if (current) {
          this.line(current);
          current = "";
        }

        for (
          let i = 0;
          i < word.length;
          i += LINE_WIDTH
        ) {
          this.line(
            word.slice(i, i + LINE_WIDTH)
          );
        }

        continue;
      }

      const candidate = current
        ? `${current} ${word}`
        : word;

      if (
        candidate.length > LINE_WIDTH &&
        current
      ) {
        this.line(current);
        current = word;
      } else {
        current = candidate;
      }
    }

    if (current) {
      this.line(current);
    }

    return this;
  }

  /**
   * Ambil hasil akhir sebagai Uint8Array.
   */
  raw(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/*
|--------------------------------------------------------------------------
| BUILD RECEIPT
|--------------------------------------------------------------------------
*/

/**
 * Mengubah ReceiptOrder menjadi data ESC/POS.
 *
 * @param order data pesanan
 * @returns Uint8Array siap dikirim ke printer
 */
export function buildReceiptEscPos(
  order: ReceiptOrder
): Uint8Array {
  const b = new ReceiptBuilder();

  /*
  |--------------------------------------------------------------------------
  | INIT PRINTER
  |--------------------------------------------------------------------------
  */

  b.push(CMD.INIT);
  b.push(CMD.NORMAL_SIZE);

  /*
  |--------------------------------------------------------------------------
  | HEADER TOKO
  |--------------------------------------------------------------------------
  */

  b.center();

  b.bold(true);
  b.big(true);

  b.line(
    STORE_INFO.name.toUpperCase()
  );

  b.big(false);
  b.bold(false);

  /*
  |--------------------------------------------------------------------------
  | STORE INFORMATION
  |--------------------------------------------------------------------------
  */

  if (STORE_INFO.address) {
    b.wrapped(STORE_INFO.address);
  }

  if (STORE_INFO.phone) {
    b.wrapped(STORE_INFO.phone);
  }

  if (STORE_INFO.instagram) {
    b.wrapped(
      `Instagram: ${STORE_INFO.instagram}`
    );
  }

  b.line();

  /*
  |--------------------------------------------------------------------------
  | ORDER META
  |--------------------------------------------------------------------------
  */

  b.dashedLine();

  b.left();

  b.row(
    "No",
    order.orderNumber || "-"
  );

  b.row(
    "Tanggal",
    formatReceiptDate(
      order.completedAt
    )
  );

  b.row(
    "Kasir",
    order.cashierName || "-"
  );

  b.row(
    "Pembayaran",
    getPaymentMethodLabel(
      order.paymentMethod
    )
  );

  b.dashedLine();

  /*
  |--------------------------------------------------------------------------
  | ORDER ITEMS
  |--------------------------------------------------------------------------
  */

  for (const item of order.items) {
    const itemName =
      item.variantName &&
      item.variantName.trim().length > 0
        ? `${item.menuName} (${item.variantName})`
        : item.menuName;

    /*
     * Nama menu
     */
    b.bold(true);
    b.wrapped(itemName);
    b.bold(false);

    /*
     * Harga x quantity
     *
     * Contoh:
     *
     * Rp10.000 x2              Rp20.000
     */
    const quantityText =
      `${formatCurrency(item.unitPrice)} x${item.quantity}`;

    b.row(
      quantityText,
      formatCurrency(item.subtotal)
    );
  }

  /*
  |--------------------------------------------------------------------------
  | TOTAL
  |--------------------------------------------------------------------------
  */

  b.dashedLine();

  b.row(
    "Subtotal",
    formatCurrency(order.subtotal)
  );

  /*
   * Discount
   */
  if (order.discount > 0) {
    b.row(
      "Diskon",
      `-${formatCurrency(order.discount)}`
    );
  }

  /*
   * Tax
   */
  if (order.tax > 0) {
    b.row(
      "Pajak",
      formatCurrency(order.tax)
    );
  }

  /*
  |--------------------------------------------------------------------------
  | GRAND TOTAL
  |--------------------------------------------------------------------------
  */

  b.bold(true);

  b.row(
    "TOTAL",
    formatCurrency(order.total)
  );

  b.bold(false);

  /*
  |--------------------------------------------------------------------------
  | PAYMENT
  |--------------------------------------------------------------------------
  */

  b.row(
    "Bayar",
    formatCurrency(order.paidAmount)
  );

  /*
   * Kembalian hanya ditampilkan kalau > 0.
   */
  if (order.changeAmount > 0) {
    b.row(
      "Kembali",
      formatCurrency(
        order.changeAmount
      )
    );
  }

  /*
  |--------------------------------------------------------------------------
  | NOTES
  |--------------------------------------------------------------------------
  */

  if (
    order.notes &&
    order.notes.trim().length > 0
  ) {
    b.dashedLine();

    b.bold(true);
    b.line("Catatan");
    b.bold(false);

    b.wrapped(order.notes);
  }

  /*
  |--------------------------------------------------------------------------
  | FOOTER
  |--------------------------------------------------------------------------
  */

  b.dashedLine();

  b.center();

  b.bold(true);

  b.wrapped(
    STORE_INFO.footerNote
  );

  b.bold(false);

  b.line();

  /*
  |--------------------------------------------------------------------------
  | PAPER FEED
  |--------------------------------------------------------------------------
  |
  | Feed beberapa baris supaya struk tidak terlalu dekat
  | dengan cutter.
  |
  */

  b.line();
  b.line();
  b.line();

  /*
  |--------------------------------------------------------------------------
  | CUT PAPER
  |--------------------------------------------------------------------------
  |
  | PERHATIAN:
  | Tidak semua printer 58mm mempunyai auto cutter.
  |
  | Jika printer kamu tidak mempunyai cutter atau printer
  | mengalami masalah setelah command ini, hapus:
  |
  | b.push(CMD.CUT);
  |
  */

  b.push(CMD.CUT);

  /*
  |--------------------------------------------------------------------------
  | RETURN BYTES
  |--------------------------------------------------------------------------
  */

  return b.raw();
}