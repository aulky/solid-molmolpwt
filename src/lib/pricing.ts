export interface OrderItemPricing {
  unitPrice: number;
  qty: number;
}

export interface PricingCalculationInput {
  items: OrderItemPricing[];
  fulfillment: "pickup" | "delivery" | "cod";
  flatDeliveryFee?: number;
  freeDeliveryMin?: number | null;
  discount?: number;
}

export interface PricingCalculationResult {
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  isFreeDelivery: boolean;
}

/**
 * Menghitung rincian harga pesanan (subtotal, ongkir, diskon, total)
 * Secara murni tanpa efek samping ke database.
 */
export function calculateOrderPricing(input: PricingCalculationInput): PricingCalculationResult {
  const {
    items,
    fulfillment,
    flatDeliveryFee = 10000,
    freeDeliveryMin = null,
    discount = 0,
  } = input;

  const subtotal = items.reduce((acc, item) => {
    const qty = Math.max(0, Math.floor(item.qty || 0));
    const price = Math.max(0, Math.floor(item.unitPrice || 0));
    return acc + qty * price;
  }, 0);

  let deliveryFee = 0;
  let isFreeDelivery = false;

  if (fulfillment === "delivery" || fulfillment === "cod") {
    if (freeDeliveryMin !== null && freeDeliveryMin !== undefined && freeDeliveryMin > 0 && subtotal >= freeDeliveryMin) {
      deliveryFee = 0;
      isFreeDelivery = true;
    } else {
      deliveryFee = Math.max(0, Math.floor(flatDeliveryFee));
      isFreeDelivery = false;
    }
  } else {
    // pickup
    deliveryFee = 0;
    isFreeDelivery = false;
  }

  const safeDiscount = Math.max(0, Math.floor(discount || 0));
  const total = Math.max(0, subtotal + deliveryFee - safeDiscount);

  return {
    subtotal,
    deliveryFee,
    discount: safeDiscount,
    total,
    isFreeDelivery,
  };
}

/**
 * Format angka ke format mata uang Rupiah Indonesia (contoh: "Rp 25.000")
 */
export function formatRupiah(amount: number): string {
  const safeAmount = Math.round(Number(amount) || 0);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safeAmount).replace(/\s+/g, " ");
}

/**
 * Format tanggal dalam zona waktu WIB (Asia/Jakarta)
 */
export function formatTanggalWIB(
  dateInput: Date | string | number,
  options?: { includeTime?: boolean; dateStyle?: "full" | "long" | "medium" | "short" }
): string {
  if (!dateInput) return "-";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "-";

  const includeTime = options?.includeTime ?? true;

  if (includeTime) {
    const datePart = new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      dateStyle: options?.dateStyle ?? "medium",
    }).format(date);

    const timePart = new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date).replace(".", ":");

    return `${datePart}, ${timePart} WIB`;
  }

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: options?.dateStyle ?? "medium",
  }).format(date);
}

/**
 * Normalisasi nomor telepon Indonesia ke format 628xxxxxxxxxx
 */
export function normalizePhone(rawPhone: string): string {
  if (!rawPhone) return "";
  let cleaned = rawPhone.replace(/\D/g, ""); // hanya digit angka

  if (cleaned.startsWith("0")) {
    cleaned = "62" + cleaned.slice(1);
  } else if (cleaned.startsWith("8")) {
    cleaned = "62" + cleaned;
  } else if (cleaned.startsWith("62")) {
    // sudah diawali 62
  } else if (cleaned.length > 0) {
    cleaned = "62" + cleaned;
  }

  return cleaned;
}

/**
 * Menghasilkan Short Code pesanan yang mudah dibaca dan didiktekan (contoh: MM-7K2P4Q)
 * Menghindari karakter ambigu seperti 0, O, 1, I
 */
export function generateShortCode(): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    result += chars[randomIndex];
  }
  return `MM-${result}`;
}
