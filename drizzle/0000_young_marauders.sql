CREATE TABLE `admin_sessions` (
	`id` varchar(64) NOT NULL,
	`token_hash` varchar(128) NOT NULL,
	`admin_user_id` int NOT NULL,
	`expires_at` datetime NOT NULL,
	`ip` varchar(45),
	`user_agent` varchar(255),
	`created_at` datetime NOT NULL DEFAULT '2026-09-30 10:00:07.555',
	CONSTRAINT `admin_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `admin_sessions_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `admin_users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`username` varchar(50) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`display_name` varchar(100) NOT NULL,
	`role` enum('owner','staff') NOT NULL DEFAULT 'owner',
	`is_active` boolean NOT NULL DEFAULT true,
	`last_login_at` datetime,
	`created_at` datetime NOT NULL DEFAULT '2026-09-30 10:00:07.555',
	CONSTRAINT `admin_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `admin_users_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `batch_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batch_id` int NOT NULL,
	`menu_item_id` int NOT NULL,
	`price_override` int,
	`stock_total` int,
	`stock_used` int NOT NULL DEFAULT 0,
	`is_available` boolean NOT NULL DEFAULT true,
	CONSTRAINT `batch_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(30) NOT NULL,
	`title` varchar(150) NOT NULL,
	`slug` varchar(150) NOT NULL,
	`description` text,
	`order_open_at` datetime NOT NULL,
	`order_close_at` datetime NOT NULL,
	`delivery_date` datetime NOT NULL,
	`pickup_start` varchar(10) DEFAULT '13:00',
	`pickup_end` varchar(10) DEFAULT '17:00',
	`pickup_address` text,
	`pickup_latitude` decimal(10,7),
	`pickup_longitude` decimal(10,7),
	`pickup_maps_url` text,
	`quota_total` int NOT NULL,
	`quota_used` int NOT NULL DEFAULT 0,
	`delivery_fee_flat` int NOT NULL DEFAULT 10000,
	`free_delivery_min` int,
	`allow_pickup` boolean NOT NULL DEFAULT true,
	`allow_delivery` boolean NOT NULL DEFAULT true,
	`allow_cod` boolean NOT NULL DEFAULT false,
	`status` enum('draft','open','closed','production','delivered','cancelled') NOT NULL DEFAULT 'draft',
	`created_at` datetime NOT NULL DEFAULT '2026-09-30 10:00:07.554',
	`updated_at` datetime NOT NULL DEFAULT '2026-09-30 10:00:07.554',
	CONSTRAINT `batches_id` PRIMARY KEY(`id`),
	CONSTRAINT `batches_code_unique` UNIQUE(`code`),
	CONSTRAINT `batches_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`slug` varchar(120) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`is_active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` int AUTO_INCREMENT NOT NULL,
	`path` varchar(255) NOT NULL,
	`mime` varchar(100) NOT NULL,
	`width` int,
	`height` int,
	`size_bytes` int NOT NULL,
	`variants` json,
	`alt` varchar(255),
	`created_at` datetime NOT NULL DEFAULT '2026-09-30 10:00:07.553',
	CONSTRAINT `media_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `menu_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sku` varchar(50) NOT NULL,
	`slug` varchar(120) NOT NULL,
	`name` varchar(150) NOT NULL,
	`description` text,
	`category_id` int,
	`base_price` int NOT NULL,
	`compare_at_price` int,
	`weight_grams` int DEFAULT 250,
	`max_per_order` int DEFAULT 20,
	`sort_order` int NOT NULL DEFAULT 0,
	`image_path` varchar(255),
	`images` json,
	`is_active` boolean NOT NULL DEFAULT true,
	`is_featured` boolean NOT NULL DEFAULT false,
	`deleted_at` datetime,
	`created_at` datetime NOT NULL DEFAULT '2026-09-30 10:00:07.553',
	`updated_at` datetime NOT NULL DEFAULT '2026-09-30 10:00:07.553',
	CONSTRAINT `menu_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `menu_items_sku_unique` UNIQUE(`sku`),
	CONSTRAINT `menu_items_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_id` char(36) NOT NULL,
	`batch_item_id` int NOT NULL,
	`menu_item_id` int NOT NULL,
	`name_snapshot` varchar(150) NOT NULL,
	`unit_price` int NOT NULL,
	`qty` int NOT NULL,
	`line_total` int NOT NULL,
	`note` varchar(255),
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_status_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_id` char(36) NOT NULL,
	`from_status` varchar(50),
	`to_status` varchar(50) NOT NULL,
	`actor_type` enum('system','admin','customer') NOT NULL DEFAULT 'system',
	`actor_admin_id` int,
	`note` text,
	`created_at` datetime NOT NULL DEFAULT '2026-09-30 10:00:07.555',
	CONSTRAINT `order_status_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` char(36) NOT NULL,
	`short_code` varchar(10) NOT NULL,
	`batch_id` int NOT NULL,
	`customer_name` varchar(100) NOT NULL,
	`customer_phone` varchar(25) NOT NULL,
	`customer_telegram` varchar(50),
	`fulfillment` enum('pickup','delivery','cod') NOT NULL,
	`address_text` text,
	`address_note` varchar(255),
	`latitude` decimal(10,7),
	`longitude` decimal(10,7),
	`gps_accuracy_m` int,
	`location_source` enum('gps_device','maps_pin','manual'),
	`subtotal` int NOT NULL,
	`delivery_fee` int NOT NULL DEFAULT 0,
	`discount` int NOT NULL DEFAULT 0,
	`total` int NOT NULL,
	`payment_method` enum('qris','transfer') NOT NULL DEFAULT 'qris',
	`payment_proof_path` varchar(255),
	`payment_status` enum('unpaid','pending_verification','verified','rejected') NOT NULL DEFAULT 'pending_verification',
	`status` enum('menunggu_verifikasi','dikonfirmasi','diproduksi','siap_diambil','dikirim','selesai','ditolak','dibatalkan') NOT NULL DEFAULT 'menunggu_verifikasi',
	`admin_note` text,
	`internal_note` text,
	`idempotency_key` varchar(64),
	`cancel_reason` varchar(255),
	`created_at` datetime NOT NULL DEFAULT '2026-09-30 10:00:07.555',
	`verified_at` datetime,
	`completed_at` datetime,
	`cancelled_at` datetime,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_short_code_unique` UNIQUE(`short_code`),
	CONSTRAINT `orders_idempotency_key_unique` UNIQUE(`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` int NOT NULL DEFAULT 1,
	`store_name` varchar(100) NOT NULL DEFAULT 'Mol-Mol Purwokerto',
	`store_tagline` varchar(255) DEFAULT 'Camilan Manis & Gurih Khas Purwokerto',
	`pickup_address` text,
	`pickup_latitude` decimal(10,7),
	`pickup_longitude` decimal(10,7),
	`pickup_maps_url` text,
	`logo_path` varchar(255),
	`qris_image_path` varchar(255),
	`bank_name` varchar(50) DEFAULT 'BCA',
	`bank_account_no` varchar(50) DEFAULT '1234567890',
	`bank_account_name` varchar(100) DEFAULT 'Mol-Mol Purwokerto',
	`bank_accounts` json,
	`allow_delivery` boolean NOT NULL DEFAULT true,
	`allow_cod` boolean NOT NULL DEFAULT false,
	`flat_delivery_fee` int NOT NULL DEFAULT 10000,
	`free_delivery_min` int DEFAULT 75000,
	`announcement_text` text,
	`announcement_active` boolean NOT NULL DEFAULT false,
	`admin_phone` varchar(30) NOT NULL DEFAULT '6281234567890',
	`admin_telegram_chat_id` varchar(64),
	`operational_hours` json,
	`maps_embed_url` text,
	`track_require_phone` boolean NOT NULL DEFAULT false,
	`updated_at` datetime NOT NULL DEFAULT '2026-09-30 10:00:07.555',
	CONSTRAINT `settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batch_item_id` int NOT NULL,
	`delta` int NOT NULL,
	`reason` enum('order_created','order_cancelled','admin_adjust','correction') NOT NULL,
	`ref_order_id` char(36),
	`note` varchar(255),
	`actor_admin_id` int,
	`created_at` datetime NOT NULL DEFAULT '2026-09-30 10:00:07.554',
	CONSTRAINT `stock_movements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `telegram_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_id` char(36),
	`chat_id` varchar(64) NOT NULL,
	`username` varchar(100),
	`is_admin` boolean NOT NULL DEFAULT false,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime NOT NULL DEFAULT '2026-09-30 10:00:07.555',
	CONSTRAINT `telegram_subscriptions_id` PRIMARY KEY(`id`)
);
