import bcrypt from "bcryptjs";
import { getDbPool, testDbConnection } from "../src/lib/db";
import * as dotenv from "dotenv";

dotenv.config();

const ALL_TABLES = [
  "order_items",
  "order_status_history",
  "stock_movements",
  "orders",
  "batch_items",
  "batches",
  "menu_items",
  "categories",
  "media",
  "telegram_subscriptions",
  "admin_sessions",
  "admin_users",
  "settings",
];

async function resetAdminOnly() {
  console.log("=== RESET DATABASE (TERMASUK MENU & PO) - HANYA ADMIN LOGIN YANG TERSISA ===");

  const connStatus = await testDbConnection();
  if (!connStatus.ok) {
    console.error("[ERROR] Gagal terhubung ke database:", connStatus.error);
    process.exit(1);
  }

  const pool = getDbPool();
  const conn = await pool.getConnection();

  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0;");

    for (const table of ALL_TABLES) {
      await conn.query(`TRUNCATE TABLE \`${table}\`;`);
      console.log(`  ✓ Kosongkan tabel: ${table}`);
    }

    await conn.query("SET FOREIGN_KEY_CHECKS = 1;");

    // 1. Seed pengaturan toko dasar
    await conn.query(
      `INSERT INTO settings (
        id, store_name, store_tagline, pickup_address, pickup_latitude, pickup_longitude, pickup_maps_url,
        bank_name, bank_account_no, bank_account_name, allow_delivery, allow_cod,
        flat_delivery_fee, free_delivery_min, announcement_text, announcement_active,
        admin_phone, track_require_phone, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        1,
        "Mol-Mol Purwokerto",
        "Dessert & Cemilan Purwokerto — Manis & Gurih Khas Purwokerto Sistem Pre-Order",
        "Jl. Prof. Dr. Suharso No. 45, Arcawinangun, Purwokerto Timur (Outlet Mol-Mol)",
        -7.4243120,
        109.2486710,
        "https://maps.google.com/?q=-7.4243120,109.2486710",
        "BCA",
        "0461234567",
        "Mol-Mol Purwokerto",
        true,
        true,
        10000,
        75000,
        "Pre-Order segera dibuka! Pantau terus pengumuman jadwal batch kami.",
        false,
        process.env.ADMIN_PHONE || "6281234567890",
        false,
      ]
    );
    console.log("  ✓ Pengaturan toko dasar diinisialisasi");

    // 2. Buat akun admin default saja
    const adminUsername = process.env.DEFAULT_ADMIN_USERNAME || "admin";
    const adminPassword = "admin123";
    const passwordHash = await bcrypt.hash(adminPassword, 10);

    await conn.query(
      `INSERT INTO admin_users (
        username, password_hash, display_name, role, is_active, created_at
      ) VALUES (?, ?, ?, 'owner', 1, NOW())`,
      [adminUsername, passwordHash, "Owner Mol-Mol"]
    );
    console.log(`  ✓ User admin default "${adminUsername}" berhasil dibuat`);

    console.log("\n=======================================================");
    console.log("✅ Database berhasil direset bersih total!");
    console.log("Semua data transaksi, pesanan, batch PO, dan menu telah dikosongkan.");
    console.log("Hanya tersisa akun login admin default:");
    console.log(`  - Username : ${adminUsername}`);
    console.log(`  - Password : ${adminPassword}`);
    console.log("=======================================================\n");
  } catch (err) {
    console.error("[ERROR] Gagal mereset database:", err);
    process.exit(1);
  } finally {
    conn.release();
    process.exit(0);
  }
}

resetAdminOnly().catch((err) => {
  console.error(err);
  process.exit(1);
});
