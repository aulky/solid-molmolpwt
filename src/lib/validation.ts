import { z } from "zod";
import { normalizePhone } from "./pricing";

// Skema Validasi Order Item
export const orderItemInputSchema = z.object({
  batchItemId: z.number().int().positive("Item batch tidak valid"),
  menuItemId: z.number().int().positive("Menu tidak valid"),
  qty: z.number().int().min(1, "Minimal kuantitas 1").max(50, "Maksimal kuantitas 50"),
  note: z.string().max(200, "Catatan maksimal 200 karakter").optional(),
});

// Skema Validasi Checkout Pesanan
export const checkoutOrderSchema = z
  .object({
    batchId: z.number().int().positive("Batch PO tidak valid"),
    customerName: z.string().trim().min(2, "Nama minimal 2 karakter").max(100, "Nama maksimal 100 karakter"),
    customerPhone: z
      .string()
      .trim()
      .min(9, "Nomor WhatsApp minimal 9 digit")
      .max(20, "Nomor WhatsApp maksimal 20 digit")
      .transform((val) => normalizePhone(val))
      .refine((val) => /^628\d{7,13}$/.test(val), {
        message: "Format nomor WhatsApp tidak valid (harus nomor Indonesia aktif, misal 0812...)",
      }),
    customerTelegram: z.string().trim().max(50).optional(),
    fulfillment: z.enum(["pickup", "delivery", "cod"], {
      message: "Pilih metode pengantaran yang valid",
    }),
    addressText: z.string().trim().max(500).optional(),
    addressNote: z.string().trim().max(255).optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    gpsAccuracyM: z.number().int().nonnegative().nullable().optional(),
    locationSource: z.enum(["gps_device", "maps_pin", "manual"]).nullable().optional(),
    paymentMethod: z.enum(["qris", "transfer"]).default("qris"),
    paymentProofPath: z.string().trim().nullable().optional(),
    idempotencyKey: z.string().trim().max(64).optional(),
    items: z.array(orderItemInputSchema).min(1, "Keranjang pesanan tidak boleh kosong"),
  })
  .superRefine((data, ctx) => {
    // Alamat wajib jika delivery atau cod
    if (data.fulfillment !== "pickup") {
      if (!data.addressText || data.addressText.trim().length < 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["addressText"],
          message: "Alamat lengkap wajib diisi untuk layanan Antar / COD (minimal 5 karakter)",
        });
      }
    }

    // Bukti bayar wajib untuk QRIS atau transfer bank (bukan COD)
    if (data.fulfillment !== "cod" || data.paymentMethod !== "transfer") {
      // Jika non-COD, bukti bayar wajib ada
      if (data.fulfillment !== "cod" && (!data.paymentProofPath || data.paymentProofPath.trim() === "")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["paymentProofPath"],
          message: "Bukti pembayaran wajib diunggah sebelum mengirim pesanan",
        });
      }
    }
  });

export type CheckoutOrderInput = z.infer<typeof checkoutOrderSchema>;

// Skema Validasi Pencarian Tracking
export const trackSearchSchema = z.object({
  query: z
    .string()
    .trim()
    .min(5, "Masukkan Order ID atau Kode Pesanan (MM-XXXXXX)")
    .max(50),
  phoneLast4: z.string().trim().length(4, "Harus 4 digit terakhir nomor HP").optional(),
});

// Skema Validasi Login Admin
export const adminLoginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username minimal 3 karakter")
    .max(50, "Username maksimal 50 karakter"),
  password: z
    .string()
    .min(6, "Password minimal 6 karakter")
    .max(100, "Password maksimal 100 karakter"),
});

// Skema Validasi Form Batch PO
export const batchFormSchema = z.object({
  code: z.string().trim().min(3, "Kode batch minimal 3 karakter (misal: PO-2026-10-A)"),
  title: z.string().trim().min(3, "Judul batch minimal 3 karakter"),
  description: z.string().trim().optional(),
  orderOpenAt: z.string().min(1, "Waktu buka pemesanan wajib diisi"),
  orderCloseAt: z.string().min(1, "Waktu tutup pemesanan wajib diisi"),
  deliveryDate: z.string().min(1, "Tanggal pengiriman wajib diisi"),
  pickupStart: z.string().default("13:00"),
  pickupEnd: z.string().default("17:00"),
  quotaTotal: z.number().int().min(1, "Kuota minimal 1 pesanan"),
  deliveryFeeFlat: z.number().int().min(0, "Biaya ongkir tidak boleh negatif").default(10000),
  freeDeliveryMin: z.number().int().min(0).nullable().optional(),
  allowPickup: z.boolean().default(true),
  allowDelivery: z.boolean().default(true),
  allowCod: z.boolean().default(false),
  status: z.enum(["draft", "open", "closed", "production", "delivered", "cancelled"]).default("draft"),
});

// Skema Validasi Menu Item
export const menuItemFormSchema = z.object({
  sku: z.string().trim().min(2, "SKU minimal 2 karakter"),
  name: z.string().trim().min(2, "Nama menu minimal 2 karakter"),
  description: z.string().trim().optional(),
  basePrice: z.number().int().min(1000, "Harga minimal Rp 1.000"),
  compareAtPrice: z.number().int().min(0).nullable().optional(),
  weightGrams: z.number().int().min(0).default(250),
  maxPerOrder: z.number().int().min(1).default(20),
  imagePath: z.string().trim().optional(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
});

// Skema Validasi Pengaturan Toko
export const storeSettingsFormSchema = z.object({
  storeName: z.string().trim().min(2, "Nama toko minimal 2 karakter"),
  storeTagline: z.string().trim().optional(),
  logoPath: z.string().trim().optional(),
  qrisImagePath: z.string().trim().optional(),
  bankName: z.string().trim().min(2, "Nama bank wajib diisi"),
  bankAccountNo: z.string().trim().min(3, "Nomor rekening wajib diisi"),
  bankAccountName: z.string().trim().min(2, "Atas nama rekening wajib diisi"),
  allowDelivery: z.boolean().default(true),
  allowCod: z.boolean().default(false),
  flatDeliveryFee: z.number().int().min(0, "Biaya ongkir tidak boleh negatif").default(10000),
  freeDeliveryMin: z.number().int().min(0).nullable().optional(),
  announcementText: z.string().trim().optional(),
  announcementActive: z.boolean().default(false),
  adminPhone: z.string().trim().min(9, "Nomor WhatsApp admin minimal 9 digit"),
  adminTelegramChatId: z.string().trim().optional(),
  trackRequirePhone: z.boolean().default(false),
});
