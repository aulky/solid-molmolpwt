import { getDbPool, testDbConnection } from "../src/lib/db";
import { runSeed } from "../src/lib/db/seed";
import * as dotenv from "dotenv";

dotenv.config();

const TABLES_DDL: Array<{ name: string; ddl: string }> = [
  {
    name: "admin_sessions",
    ddl: `CREATE TABLE IF NOT EXISTS \`admin_sessions\` (
      \`id\` varchar(64) NOT NULL,
      \`token_hash\` varchar(128) NOT NULL,
      \`admin_user_id\` int NOT NULL,
      \`expires_at\` datetime NOT NULL,
      \`ip\` varchar(255) DEFAULT NULL,
      \`user_agent\` varchar(255) DEFAULT NULL,
      \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`admin_sessions_token_hash_unique\` (\`token_hash\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
  },
  {
    name: "admin_users",
    ddl: `CREATE TABLE IF NOT EXISTS \`admin_users\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`username\` varchar(50) NOT NULL,
      \`password_hash\` varchar(255) NOT NULL,
      \`display_name\` varchar(100) NOT NULL,
      \`role\` enum('owner','staff') NOT NULL DEFAULT 'owner',
      \`is_active\` boolean NOT NULL DEFAULT true,
      \`last_login_at\` datetime DEFAULT NULL,
      \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`admin_users_username_unique\` (\`username\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
  },
  {
    name: "categories",
    ddl: `CREATE TABLE IF NOT EXISTS \`categories\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`name\` varchar(100) NOT NULL,
      \`slug\` varchar(120) NOT NULL,
      \`sort_order\` int NOT NULL DEFAULT 0,
      \`is_active\` boolean NOT NULL DEFAULT true,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`categories_slug_unique\` (\`slug\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
  },
  {
    name: "media",
    ddl: `CREATE TABLE IF NOT EXISTS \`media\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`path\` varchar(255) NOT NULL,
      \`mime\` varchar(100) NOT NULL,
      \`width\` int DEFAULT NULL,
      \`height\` int DEFAULT NULL,
      \`size_bytes\` int NOT NULL,
      \`variants\` json DEFAULT NULL,
      \`alt\` varchar(255) DEFAULT NULL,
      \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
  },
  {
    name: "menu_items",
    ddl: `CREATE TABLE IF NOT EXISTS \`menu_items\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`sku\` varchar(50) NOT NULL,
      \`slug\` varchar(120) NOT NULL,
      \`name\` varchar(150) NOT NULL,
      \`description\` text DEFAULT NULL,
      \`category_id\` int DEFAULT NULL,
      \`base_price\` int NOT NULL,
      \`compare_at_price\` int DEFAULT NULL,
      \`weight_grams\` int DEFAULT 250,
      \`max_per_order\` int DEFAULT 20,
      \`sort_order\` int NOT NULL DEFAULT 0,
      \`image_path\` varchar(255) DEFAULT NULL,
      \`images\` json DEFAULT NULL,
      \`is_active\` boolean NOT NULL DEFAULT true,
      \`is_featured\` boolean NOT NULL DEFAULT false,
      \`deleted_at\` datetime DEFAULT NULL,
      \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`menu_items_sku_unique\` (\`sku\`),
      UNIQUE KEY \`menu_items_slug_unique\` (\`slug\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
  },
  {
    name: "batches",
    ddl: `CREATE TABLE IF NOT EXISTS \`batches\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`code\` varchar(30) NOT NULL,
      \`title\` varchar(150) NOT NULL,
      \`slug\` varchar(150) NOT NULL,
      \`description\` text DEFAULT NULL,
      \`order_open_at\` datetime NOT NULL,
      \`order_close_at\` datetime NOT NULL,
      \`delivery_date\` datetime NOT NULL,
      \`pickup_start\` varchar(10) DEFAULT '13:00',
      \`pickup_end\` varchar(10) DEFAULT '17:00',
      \`pickup_address\` text DEFAULT NULL,
      \`pickup_latitude\` decimal(10,7) DEFAULT NULL,
      \`pickup_longitude\` decimal(10,7) DEFAULT NULL,
      \`pickup_maps_url\` text DEFAULT NULL,
      \`quota_total\` int NOT NULL,
      \`quota_used\` int NOT NULL DEFAULT 0,
      \`delivery_fee_flat\` int NOT NULL DEFAULT 10000,
      \`free_delivery_min\` int DEFAULT 75000,
      \`allow_pickup\` boolean NOT NULL DEFAULT true,
      \`allow_delivery\` boolean NOT NULL DEFAULT true,
      \`allow_cod\` boolean NOT NULL DEFAULT false,
      \`status\` enum('draft','open','closed','production','delivered','cancelled') NOT NULL DEFAULT 'draft',
      \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`batches_code_unique\` (\`code\`),
      UNIQUE KEY \`batches_slug_unique\` (\`slug\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
  },
  {
    name: "batch_items",
    ddl: `CREATE TABLE IF NOT EXISTS \`batch_items\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`batch_id\` int NOT NULL,
      \`menu_item_id\` int NOT NULL,
      \`price_override\` int DEFAULT NULL,
      \`stock_total\` int DEFAULT NULL,
      \`stock_used\` int NOT NULL DEFAULT 0,
      \`is_available\` boolean NOT NULL DEFAULT true,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
  },
  {
    name: "stock_movements",
    ddl: `CREATE TABLE IF NOT EXISTS \`stock_movements\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`batch_item_id\` int NOT NULL,
      \`delta\` int NOT NULL,
      \`reason\` enum('order_created','order_cancelled','admin_adjust','correction') NOT NULL,
      \`ref_order_id\` char(36) DEFAULT NULL,
      \`note\` varchar(255) DEFAULT NULL,
      \`actor_admin_id\` int DEFAULT NULL,
      \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
  },
  {
    name: "orders",
    ddl: `CREATE TABLE IF NOT EXISTS \`orders\` (
      \`id\` char(36) NOT NULL,
      \`short_code\` varchar(10) NOT NULL,
      \`batch_id\` int NOT NULL,
      \`customer_name\` varchar(100) NOT NULL,
      \`customer_phone\` varchar(25) NOT NULL,
      \`customer_telegram\` varchar(50) DEFAULT NULL,
      \`fulfillment\` enum('pickup','delivery','cod') NOT NULL,
      \`address_text\` text DEFAULT NULL,
      \`address_note\` varchar(255) DEFAULT NULL,
      \`latitude\` decimal(10,7) DEFAULT NULL,
      \`longitude\` decimal(10,7) DEFAULT NULL,
      \`gps_accuracy_m\` int DEFAULT NULL,
      \`location_source\` enum('gps_device','maps_pin','manual') DEFAULT NULL,
      \`subtotal\` int NOT NULL,
      \`delivery_fee\` int NOT NULL DEFAULT 0,
      \`discount\` int NOT NULL DEFAULT 0,
      \`total\` int NOT NULL,
      \`payment_method\` enum('qris','transfer') NOT NULL DEFAULT 'qris',
      \`payment_proof_path\` varchar(255) DEFAULT NULL,
      \`payment_status\` enum('unpaid','pending_verification','verified','rejected') NOT NULL DEFAULT 'pending_verification',
      \`status\` enum('menunggu_verifikasi','dikonfirmasi','diproduksi','siap_diambil','dikirim','selesai','ditolak','dibatalkan') NOT NULL DEFAULT 'menunggu_verifikasi',
      \`admin_note\` text DEFAULT NULL,
      \`internal_note\` text DEFAULT NULL,
      \`idempotency_key\` varchar(64) DEFAULT NULL,
      \`cancel_reason\` varchar(255) DEFAULT NULL,
      \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`verified_at\` datetime DEFAULT NULL,
      \`completed_at\` datetime DEFAULT NULL,
      \`cancelled_at\` datetime DEFAULT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`orders_short_code_unique\` (\`short_code\`),
      UNIQUE KEY \`orders_idempotency_key_unique\` (\`idempotency_key\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
  },
  {
    name: "order_items",
    ddl: `CREATE TABLE IF NOT EXISTS \`order_items\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`order_id\` char(36) NOT NULL,
      \`batch_item_id\` int NOT NULL,
      \`menu_item_id\` int NOT NULL,
      \`name_snapshot\` varchar(150) NOT NULL,
      \`unit_price\` int NOT NULL,
      \`qty\` int NOT NULL,
      \`line_total\` int NOT NULL,
      \`note\` varchar(255) DEFAULT NULL,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
  },
  {
    name: "order_status_history",
    ddl: `CREATE TABLE IF NOT EXISTS \`order_status_history\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`order_id\` char(36) NOT NULL,
      \`from_status\` varchar(50) DEFAULT NULL,
      \`to_status\` varchar(50) NOT NULL,
      \`actor_type\` enum('system','admin','customer') NOT NULL DEFAULT 'system',
      \`actor_admin_id\` int DEFAULT NULL,
      \`note\` text DEFAULT NULL,
      \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
  },
  {
    name: "telegram_subscriptions",
    ddl: `CREATE TABLE IF NOT EXISTS \`telegram_subscriptions\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`order_id\` char(36) DEFAULT NULL,
      \`chat_id\` varchar(64) NOT NULL,
      \`username\` varchar(100) DEFAULT NULL,
      \`is_admin\` boolean NOT NULL DEFAULT false,
      \`is_active\` boolean NOT NULL DEFAULT true,
      \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
  },
  {
    name: "settings",
    ddl: `CREATE TABLE IF NOT EXISTS \`settings\` (
      \`id\` int NOT NULL DEFAULT 1,
      \`store_name\` varchar(100) NOT NULL DEFAULT 'Mol-Mol Purwokerto',
      \`store_tagline\` varchar(255) DEFAULT 'Dessert & Cemilan Purwokerto — Manis & Gurih Khas Purwokerto Sistem Pre-Order',
      \`pickup_address\` text DEFAULT NULL,
      \`pickup_latitude\` decimal(10,7) DEFAULT NULL,
      \`pickup_longitude\` decimal(10,7) DEFAULT NULL,
      \`pickup_maps_url\` text DEFAULT NULL,
      \`logo_path\` varchar(255) DEFAULT NULL,
      \`qris_image_path\` varchar(255) DEFAULT NULL,
      \`bank_name\` varchar(50) DEFAULT 'BCA',
      \`bank_account_no\` varchar(50) DEFAULT '1234567890',
      \`bank_account_name\` varchar(100) DEFAULT 'Mol-Mol Purwokerto',
      \`bank_accounts\` json DEFAULT NULL,
      \`allow_delivery\` boolean NOT NULL DEFAULT true,
      \`allow_cod\` boolean NOT NULL DEFAULT false,
      \`flat_delivery_fee\` int NOT NULL DEFAULT 10000,
      \`free_delivery_min\` int DEFAULT 75000,
      \`announcement_text\` text DEFAULT NULL,
      \`announcement_active\` boolean NOT NULL DEFAULT false,
      \`admin_phone\` varchar(30) NOT NULL DEFAULT '6281234567890',
      \`admin_telegram_chat_id\` varchar(64) DEFAULT NULL,
      \`operational_hours\` json DEFAULT NULL,
      \`maps_embed_url\` text DEFAULT NULL,
      \`track_require_phone\` boolean NOT NULL DEFAULT false,
      \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
  },
];

export async function initDatabase(): Promise<void> {
  console.log("[INIT] Memeriksa koneksi database MySQL/MariaDB...");
  const connStatus = await testDbConnection();
  if (!connStatus.ok) {
    console.error("[ERROR] Gagal terhubung ke database:", connStatus.error);
    process.exit(1);
  }

  const pool = getDbPool();
  const conn = await pool.getConnection();

  try {
    console.log("[INIT] Membuat struktur tabel database jika belum ada...");
    await conn.query("SET FOREIGN_KEY_CHECKS = 0;");

    for (const item of TABLES_DDL) {
      await conn.query(item.ddl);
      console.log(`  ✓ Tabel \`${item.name}\` siap`);
    }

    // Pastikan kolom ip di admin_sessions cukup panjang untuk multi-proxy IP (Cloudflare + Nginx)
    try {
      await conn.query("ALTER TABLE `admin_sessions` MODIFY COLUMN `ip` varchar(255) DEFAULT NULL;");
    } catch {}

    await conn.query("SET FOREIGN_KEY_CHECKS = 1;");
    console.log("[OK] Seluruh 13 tabel database berhasil diinisialisasi!\n");
  } catch (err: any) {
    console.error("[ERROR] Inisialisasi tabel gagal:", err);
    process.exit(1);
  } finally {
    conn.release();
  }
}

async function main() {
  await initDatabase();
  console.log("[INIT] Menjalankan seeding data awal...");
  await runSeed();
  console.log("\n✅ Setup database selesai! Database siap digunakan.");
  process.exit(0);
}

if (process.argv[1]?.endsWith("init-db.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
