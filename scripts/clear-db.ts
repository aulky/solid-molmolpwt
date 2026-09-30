import { getDbPool, testDbConnection } from "../src/lib/db";
import * as dotenv from "dotenv";

dotenv.config();

const TRANSACTIONAL_TABLES = [
  "order_items",
  "order_status_history",
  "stock_movements",
  "orders",
];

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

async function main() {
  const isOrdersOnly = process.argv.includes("--orders-only") || process.argv.includes("-o");

  const connStatus = await testDbConnection();
  if (!connStatus.ok) {
    console.error("[ERROR] Gagal terhubung ke database:", connStatus.error);
    process.exit(1);
  }

  const pool = getDbPool();
  const conn = await pool.getConnection();

  try {
    const targetTables = isOrdersOnly ? TRANSACTIONAL_TABLES : ALL_TABLES;
    console.log(
      isOrdersOnly
        ? "[INFO] Mengosongkan data pesanan dan riwayat transaksi (orders only)..."
        : "[INFO] Mengosongkan SELURUH tabel database..."
    );

    await conn.query("SET FOREIGN_KEY_CHECKS = 0;");

    for (const table of targetTables) {
      await conn.query(`TRUNCATE TABLE \`${table}\`;`);
      console.log(`  ✓ Truncated table: ${table}`);
    }

    await conn.query("SET FOREIGN_KEY_CHECKS = 1;");

    console.log(
      isOrdersOnly
        ? "✅ Data pesanan & riwayat transaksi berhasil dibersihkan!"
        : "✅ Seluruh data database berhasil dibersihkan!"
    );
  } catch (err) {
    console.error("[ERROR] Gagal mengosongkan database:", err);
    process.exit(1);
  } finally {
    conn.release();
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
