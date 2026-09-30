import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, testDbConnection } from "./index";
import {
  adminUsers,
  batches,
  batchItems,
  categories,
  menuItems,
  settings,
} from "./schema";
import * as dotenv from "dotenv";

dotenv.config();

export async function runSeed(): Promise<void> {
  console.log("[SEED] Menjalankan seeder database Mol-Mol Purwokerto...");

  const connStatus = await testDbConnection();
  if (!connStatus.ok) {
    console.warn("[WARNING] Database tidak dapat dihubungi:", connStatus.error);
    console.warn("[INFO] Lewati seeding sampai MySQL aktif dan kredensial .env terkonfigurasi.");
    return;
  }

  try {
    // 1. Settings (id=1)
    const existingSettings = await db
      .select()
      .from(settings)
      .where(eq(settings.id, 1))
      .limit(1);

    if (existingSettings.length === 0) {
      await db.insert(settings).values({
        id: 1,
        storeName: "Mol-Mol Purwokerto",
        storeTagline: "Dessert & Cemilan Purwokerto — Manis & Gurih Khas Purwokerto Sistem Pre-Order",
        bankName: "BCA",
        bankAccountNo: "0461234567",
        bankAccountName: "Mol-Mol Purwokerto",
        allowDelivery: true,
        allowCod: true,
        flatDeliveryFee: 10000,
        freeDeliveryMin: 75000,
        announcementText: "Pre-Order Batch Oktober telah dibuka! Kuota terbatas 50 slot pesanan.",
        announcementActive: true,
        adminPhone: process.env.ADMIN_PHONE || "6281234567890",
        adminTelegramChatId: process.env.TELEGRAM_ADMIN_CHAT_ID || "",
        trackRequirePhone: false,
        updatedAt: new Date(),
      });
      console.log("[OK] Pengaturan toko berhasil di-seed.");
    } else {
      console.log("[INFO] Pengaturan toko sudah ada, lewati.");
    }

    // 2. Admin User
    const adminUsername = process.env.DEFAULT_ADMIN_USERNAME || "admin";
    const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD || "AdminMolMolPurwokerto2026!";
    const existingAdmin = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.username, adminUsername))
      .limit(1);

    if (existingAdmin.length === 0) {
      const passwordHash = await bcrypt.hash(adminPassword, 10);
      await db.insert(adminUsers).values({
        username: adminUsername,
        passwordHash,
        displayName: process.env.DEFAULT_ADMIN_NAME || "Owner Mol-Mol",
        role: "owner",
        isActive: true,
        createdAt: new Date(),
      });
      console.log(`✅ Admin user "${adminUsername}" berhasil dibuat.`);
    } else {
      console.log(`[INFO] Admin user "${adminUsername}" sudah ada (lewati update password agar tidak tertimpa).`);
    }

    // 3. Categories
    const catList = [
      { name: "Mol-Mol Manis", slug: "mol-mol-manis", sortOrder: 1 },
      { name: "Mol-Mol Gurih", slug: "mol-mol-gurih", sortOrder: 2 },
    ];

    const categoryMap = new Map<string, number>();

    for (const cat of catList) {
      const existing = await db
        .select()
        .from(categories)
        .where(eq(categories.slug, cat.slug))
        .limit(1);

      if (existing.length === 0) {
        const [result]: any = await db.insert(categories).values({
          name: cat.name,
          slug: cat.slug,
          sortOrder: cat.sortOrder,
          isActive: true,
        });
        categoryMap.set(cat.slug, result.insertId);
      } else {
        categoryMap.set(cat.slug, existing[0].id);
      }
    }
    console.log("✅ Kategori menu berhasil diperiksa/dibuat.");

    // 4. Menu Items
    const sampleMenus = [
      {
        sku: "MM-ORIGINAL",
        slug: "mol-mol-original-wijen",
        name: "Mol-Mol Original Wijen",
        description: "Camilan mol-mol klasik khas Purwokerto dengan taburan wijen renyah di luar, lembut dan kenyal gurih di dalam.",
        basePrice: 20000,
        weightGrams: 250,
        imagePath: "/images/molmol-original.svg",
        categorySlug: "mol-mol-manis",
        isFeatured: true,
      },
      {
        sku: "MM-COKLAT",
        slug: "mol-mol-coklat-lumer",
        name: "Mol-Mol Coklat Lumer",
        description: "Mol-mol lembut dengan isian coklat lumer premium yang meleleh di mulut saat dinikmati hangat bersama teh atau kopi.",
        basePrice: 25000,
        weightGrams: 250,
        imagePath: "/images/molmol-coklat.svg",
        categorySlug: "mol-mol-manis",
        isFeatured: true,
      },
      {
        sku: "MM-KEJU",
        slug: "mol-mol-keju-gurih",
        name: "Mol-Mol Keju Gurih",
        description: "Perpaduan rasa gurih keju cheddar parut melimpah di dalam adonan kenyal harum khas resep Mol-Mol Purwokerto.",
        basePrice: 26000,
        weightGrams: 250,
        imagePath: "/images/molmol-keju.svg",
        categorySlug: "mol-mol-gurih",
        isFeatured: true,
      },
      {
        sku: "MM-MIX",
        slug: "mol-mol-mix-aneka-rasa",
        name: "Mol-Mol Mix Aneka Rasa",
        description: "Paket komplit isi 10 pcs aneka rasa favorit (Original, Coklat, Keju) sangat cocok untuk dinikmati bersama keluarga.",
        basePrice: 28000,
        weightGrams: 300,
        imagePath: "/images/molmol-mix.svg",
        categorySlug: "mol-mol-manis",
        isFeatured: false,
      },
    ];

    const insertedMenuIds: number[] = [];

    for (const m of sampleMenus) {
      const existing = await db
        .select()
        .from(menuItems)
        .where(eq(menuItems.sku, m.sku))
        .limit(1);

      if (existing.length === 0) {
        const catId = categoryMap.get(m.categorySlug) || null;
        const [res]: any = await db.insert(menuItems).values({
          sku: m.sku,
          slug: m.slug,
          name: m.name,
          description: m.description,
          basePrice: m.basePrice,
          weightGrams: m.weightGrams,
          imagePath: m.imagePath,
          categoryId: catId,
          isActive: true,
          isFeatured: m.isFeatured,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        insertedMenuIds.push(res.insertId);
      } else {
        if (!existing[0].imagePath) {
          await db
            .update(menuItems)
            .set({ imagePath: m.imagePath })
            .where(eq(menuItems.id, existing[0].id));
        }
        insertedMenuIds.push(existing[0].id);
      }
    }
    console.log("✅ Menu master berhasil diperiksa/dibuat.");

    // 5. Active PO Batch
    const batchCode = "PO-2026-10-A";
    const existingBatch = await db
      .select()
      .from(batches)
      .where(eq(batches.code, batchCode))
      .limit(1);

    let currentBatchId: number;

    if (existingBatch.length === 0) {
      const now = new Date();
      const openAt = new Date(now.getTime() - 24 * 60 * 60 * 1000); // dibuka kemarin
      const closeAt = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000); // tutup 5 hari lagi
      const deliveryDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // kirim 7 hari lagi

      const [batchRes]: any = await db.insert(batches).values({
        code: batchCode,
        title: "Pre-Order Spesial Batch Oktober 2026",
        slug: "po-oktober-2026-a",
        description: "Batch pre-order segar diolah higienis untuk pengantaran & pengambilan area Purwokerto sekitarnya.",
        orderOpenAt: openAt,
        orderCloseAt: closeAt,
        deliveryDate: deliveryDate,
        pickupStart: "13:00",
        pickupEnd: "17:00",
        quotaTotal: 50,
        quotaUsed: 0,
        deliveryFeeFlat: 10000,
        freeDeliveryMin: 75000,
        allowPickup: true,
        allowDelivery: true,
        allowCod: true,
        status: "open",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      currentBatchId = batchRes.insertId;
      console.log(`✅ Batch PO "${batchCode}" berhasil dibuat.`);
    } else {
      currentBatchId = existingBatch[0].id;
      console.log(`ℹ️ Batch PO "${batchCode}" sudah ada.`);
    }

    // 6. Batch Items
    for (const menuId of insertedMenuIds) {
      const existingItem = await db
        .select()
        .from(batchItems)
        .where(eq(batchItems.batchId, currentBatchId))
        .limit(10);

      const alreadyInBatch = existingItem.some((item) => item.menuItemId === menuId);
      if (!alreadyInBatch) {
        await db.insert(batchItems).values({
          batchId: currentBatchId,
          menuItemId: menuId,
          stockTotal: 40, // kuota 40 porsi per menu
          stockUsed: 0,
          isAvailable: true,
        });
      }
    }
    console.log("[OK] Item batch PO berhasil ditautkan.");

    console.log("[SUCCESS] Seeding database selesai dengan sukses!");
  } catch (err: any) {
    console.error("[ERROR] Terjadi kesalahan saat seeding:", err?.message || err);
  }
}

// Jalankan langsung bila dieksekusi via CLI
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("seed.ts")) {
  runSeed().then(() => process.exit(0)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
