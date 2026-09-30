import { eq } from "drizzle-orm";
import { db } from "../db";
import { settings } from "../db/schema";

export interface BankAccountItem {
  bankName: string;
  bankAccountNo: string;
  bankAccountName: string;
}

export interface StoreSettingsData {
  id: number;
  storeName: string;
  storeTagline: string | null;
  pickupAddress?: string | null;
  pickupLatitude?: number | string | null;
  pickupLongitude?: number | string | null;
  pickupMapsUrl?: string | null;
  logoPath: string | null;
  qrisImagePath: string | null;
  bankName: string;
  bankAccountNo: string;
  bankAccountName: string;
  bankAccounts?: BankAccountItem[] | null;
  allowDelivery: boolean;
  allowCod: boolean;
  flatDeliveryFee: number;
  freeDeliveryMin: number | null;
  announcementText: string | null;
  announcementActive: boolean;
  adminPhone: string;
  adminTelegramChatId: string | null;
  operationalHours: { open: string; close: string; days: string } | null;
  mapsEmbedUrl: string | null;
  trackRequirePhone: boolean;
}

export const DEFAULT_SETTINGS: StoreSettingsData = {
  id: 1,
  storeName: "Mol-Mol Purwokerto",
  storeTagline: "Dessert & Cemilan Purwokerto — Manis & Gurih Khas Purwokerto Sistem Pre-Order",
  pickupAddress: "Jl. Prof. Dr. Suharso No. 45, Arcawinangun, Purwokerto Timur (Outlet Mol-Mol)",
  pickupLatitude: -7.4243120,
  pickupLongitude: 109.2486710,
  pickupMapsUrl: "https://maps.google.com/?q=-7.4243120,109.2486710",
  logoPath: null,
  qrisImagePath: null,
  bankName: "BCA",
  bankAccountNo: "0461234567",
  bankAccountName: "Mol-Mol Purwokerto",
  bankAccounts: [
    { bankName: "BCA", bankAccountNo: "0461234567", bankAccountName: "Mol-Mol Purwokerto" },
  ],
  allowDelivery: true,
  allowCod: true,
  flatDeliveryFee: 10000,
  freeDeliveryMin: 75000,
  announcementText: "Pre-Order Batch telah dibuka! Pesan sekarang sebelum kuota habis.",
  announcementActive: true,
  adminPhone: "6281234567890",
  adminTelegramChatId: null,
  operationalHours: { open: "08:00", close: "20:00", days: "Setiap Hari" },
  mapsEmbedUrl: null,
  trackRequirePhone: false,
};

export async function getStoreSettings(): Promise<StoreSettingsData> {
  try {
    const rows = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
    if (rows.length > 0) {
      const bList = (rows[0].bankAccounts as BankAccountItem[]) || [];
      const primaryBank: BankAccountItem = {
        bankName: rows[0].bankName || "BCA",
        bankAccountNo: rows[0].bankAccountNo || "0461234567",
        bankAccountName: rows[0].bankAccountName || "Mol-Mol Purwokerto",
      };
      const finalBankAccounts = bList.length > 0 ? bList : [primaryBank];

      return {
        id: rows[0].id,
        storeName: rows[0].storeName,
        storeTagline: rows[0].storeTagline,
        pickupAddress: rows[0].pickupAddress || DEFAULT_SETTINGS.pickupAddress,
        pickupLatitude: rows[0].pickupLatitude || DEFAULT_SETTINGS.pickupLatitude,
        pickupLongitude: rows[0].pickupLongitude || DEFAULT_SETTINGS.pickupLongitude,
        pickupMapsUrl: rows[0].pickupMapsUrl || DEFAULT_SETTINGS.pickupMapsUrl,
        logoPath: rows[0].logoPath,
        qrisImagePath: rows[0].qrisImagePath,
        bankName: rows[0].bankName || finalBankAccounts[0]?.bankName || "BCA",
        bankAccountNo: rows[0].bankAccountNo || finalBankAccounts[0]?.bankAccountNo || "0461234567",
        bankAccountName: rows[0].bankAccountName || finalBankAccounts[0]?.bankAccountName || "Mol-Mol Purwokerto",
        bankAccounts: finalBankAccounts,
        allowDelivery: Boolean(rows[0].allowDelivery),
        allowCod: Boolean(rows[0].allowCod),
        flatDeliveryFee: rows[0].flatDeliveryFee,
        freeDeliveryMin: rows[0].freeDeliveryMin,
        announcementText: rows[0].announcementText,
        announcementActive: Boolean(rows[0].announcementActive),
        adminPhone: rows[0].adminPhone,
        adminTelegramChatId: rows[0].adminTelegramChatId,
        operationalHours: rows[0].operationalHours as any,
        mapsEmbedUrl: rows[0].mapsEmbedUrl,
        trackRequirePhone: Boolean(rows[0].trackRequirePhone),
      };
    }
  } catch (err) {
    console.warn("Menggunakan pengaturan toko default (koneksi DB belum aktif):", err);
  }
  return DEFAULT_SETTINGS;
}

export async function updateStoreSettings(data: Partial<StoreSettingsData>): Promise<void> {
  const existing = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  if (existing.length === 0) {
    await db.insert(settings).values({
      id: 1,
      ...data,
      updatedAt: new Date(),
    } as any);
  } else {
    await db.update(settings).set({
      ...data,
      updatedAt: new Date(),
    } as any).where(eq(settings.id, 1));
  }
}
