import {
  mysqlTable,
  serial,
  int,
  varchar,
  text,
  char,
  decimal,
  datetime,
  boolean,
  json,
  mysqlEnum,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";

// 1. Categories
export const categories = mysqlTable("categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  sortOrder: int("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
});

// 2. Media Table (local storage records)
export const media = mysqlTable("media", {
  id: serial("id").primaryKey(),
  path: varchar("path", { length: 255 }).notNull(),
  mime: varchar("mime", { length: 100 }).notNull(),
  width: int("width"),
  height: int("height"),
  sizeBytes: int("size_bytes").notNull(),
  variants: json("variants").$type<{ thumb?: string; card?: string; full?: string }>(),
  alt: varchar("alt", { length: 255 }),
  createdAt: datetime("created_at").default(new Date()).notNull(),
});

// 3. Menu Items Master
export const menuItems = mysqlTable("menu_items", {
  id: serial("id").primaryKey(),
  sku: varchar("sku", { length: 50 }).notNull().unique(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  name: varchar("name", { length: 150 }).notNull(),
  description: text("description"),
  categoryId: int("category_id"),
  basePrice: int("base_price").notNull(), // Rupiah without cents
  compareAtPrice: int("compare_at_price"),
  weightGrams: int("weight_grams").default(250),
  maxPerOrder: int("max_per_order").default(20),
  sortOrder: int("sort_order").default(0).notNull(),
  imagePath: varchar("image_path", { length: 255 }),
  images: json("images").$type<string[]>(),
  isActive: boolean("is_active").default(true).notNull(),
  isFeatured: boolean("is_featured").default(false).notNull(),
  deletedAt: datetime("deleted_at"),
  createdAt: datetime("created_at").default(new Date()).notNull(),
  updatedAt: datetime("updated_at").default(new Date()).notNull(),
});

// 4. Batches (PO Waves)
export const batches = mysqlTable("batches", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 30 }).notNull().unique(), // e.g. PO-2026-10-A
  title: varchar("title", { length: 150 }).notNull(),
  slug: varchar("slug", { length: 150 }).notNull().unique(),
  description: text("description"),
  orderOpenAt: datetime("order_open_at").notNull(),
  orderCloseAt: datetime("order_close_at").notNull(),
  deliveryDate: datetime("delivery_date").notNull(),
  pickupStart: varchar("pickup_start", { length: 10 }).default("13:00"),
  pickupEnd: varchar("pickup_end", { length: 10 }).default("17:00"),
  pickupAddress: text("pickup_address"),
  pickupLatitude: decimal("pickup_latitude", { precision: 10, scale: 7 }),
  pickupLongitude: decimal("pickup_longitude", { precision: 10, scale: 7 }),
  pickupMapsUrl: text("pickup_maps_url"),
  quotaTotal: int("quota_total").notNull(),
  quotaUsed: int("quota_used").default(0).notNull(),
  deliveryFeeFlat: int("delivery_fee_flat").default(10000).notNull(),
  freeDeliveryMin: int("free_delivery_min"),
  allowPickup: boolean("allow_pickup").default(true).notNull(),
  allowDelivery: boolean("allow_delivery").default(true).notNull(),
  allowCod: boolean("allow_cod").default(false).notNull(),
  status: mysqlEnum("status", [
    "draft",
    "open",
    "closed",
    "production",
    "delivered",
    "cancelled",
  ]).default("draft").notNull(),
  createdAt: datetime("created_at").default(new Date()).notNull(),
  updatedAt: datetime("updated_at").default(new Date()).notNull(),
});

// 5. Batch Items
export const batchItems = mysqlTable("batch_items", {
  id: serial("id").primaryKey(),
  batchId: int("batch_id").notNull(),
  menuItemId: int("menu_item_id").notNull(),
  priceOverride: int("price_override"),
  stockTotal: int("stock_total"), // NULL = unlimited within batch quota
  stockUsed: int("stock_used").default(0).notNull(),
  isAvailable: boolean("is_available").default(true).notNull(),
});

// 6. Stock Movements Audit
export const stockMovements = mysqlTable("stock_movements", {
  id: serial("id").primaryKey(),
  batchItemId: int("batch_item_id").notNull(),
  delta: int("delta").notNull(), // + or -
  reason: mysqlEnum("reason", [
    "order_created",
    "order_cancelled",
    "admin_adjust",
    "correction",
  ]).notNull(),
  refOrderId: char("ref_order_id", { length: 36 }),
  note: varchar("note", { length: 255 }),
  actorAdminId: int("actor_admin_id"),
  createdAt: datetime("created_at").default(new Date()).notNull(),
});

// 7. Orders
export const orders = mysqlTable("orders", {
  id: char("id", { length: 36 }).primaryKey(), // UUID v4
  shortCode: varchar("short_code", { length: 10 }).notNull().unique(), // e.g. MM-7K2P4Q
  batchId: int("batch_id").notNull(),
  customerName: varchar("customer_name", { length: 100 }).notNull(),
  customerPhone: varchar("customer_phone", { length: 25 }).notNull(),
  customerTelegram: varchar("customer_telegram", { length: 50 }),
  fulfillment: mysqlEnum("fulfillment", ["pickup", "delivery", "cod"]).notNull(),
  addressText: text("address_text"),
  addressNote: varchar("address_note", { length: 255 }),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  gpsAccuracyM: int("gps_accuracy_m"),
  locationSource: mysqlEnum("location_source", ["gps_device", "maps_pin", "manual"]),
  subtotal: int("subtotal").notNull(),
  deliveryFee: int("delivery_fee").default(0).notNull(),
  discount: int("discount").default(0).notNull(),
  total: int("total").notNull(),
  paymentMethod: mysqlEnum("payment_method", ["qris", "transfer"]).default("qris").notNull(),
  paymentProofPath: varchar("payment_proof_path", { length: 255 }),
  paymentStatus: mysqlEnum("payment_status", [
    "unpaid",
    "pending_verification",
    "verified",
    "rejected",
  ]).default("pending_verification").notNull(),
  status: mysqlEnum("status", [
    "menunggu_verifikasi",
    "dikonfirmasi",
    "diproduksi",
    "siap_diambil",
    "dikirim",
    "selesai",
    "ditolak",
    "dibatalkan",
  ]).default("menunggu_verifikasi").notNull(),
  adminNote: text("admin_note"),
  internalNote: text("internal_note"),
  idempotencyKey: varchar("idempotency_key", { length: 64 }).unique(),
  cancelReason: varchar("cancel_reason", { length: 255 }),
  createdAt: datetime("created_at").default(new Date()).notNull(),
  verifiedAt: datetime("verified_at"),
  completedAt: datetime("completed_at"),
  cancelledAt: datetime("cancelled_at"),
});

// 8. Order Items (Snapshot)
export const orderItems = mysqlTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: char("order_id", { length: 36 }).notNull(),
  batchItemId: int("batch_item_id").notNull(),
  menuItemId: int("menu_item_id").notNull(),
  nameSnapshot: varchar("name_snapshot", { length: 150 }).notNull(),
  unitPrice: int("unit_price").notNull(),
  qty: int("qty").notNull(),
  lineTotal: int("line_total").notNull(),
  note: varchar("note", { length: 255 }),
});

// 9. Order Status History
export const orderStatusHistory = mysqlTable("order_status_history", {
  id: serial("id").primaryKey(),
  orderId: char("order_id", { length: 36 }).notNull(),
  fromStatus: varchar("from_status", { length: 50 }),
  toStatus: varchar("to_status", { length: 50 }).notNull(),
  actorType: mysqlEnum("actor_type", ["system", "admin", "customer"]).default("system").notNull(),
  actorAdminId: int("actor_admin_id"),
  note: text("note"),
  createdAt: datetime("created_at").default(new Date()).notNull(),
});

// 10. Telegram Subscriptions
export const telegramSubscriptions = mysqlTable("telegram_subscriptions", {
  id: serial("id").primaryKey(),
  orderId: char("order_id", { length: 36 }),
  chatId: varchar("chat_id", { length: 64 }).notNull(),
  username: varchar("username", { length: 100 }),
  isAdmin: boolean("is_admin").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: datetime("created_at").default(new Date()).notNull(),
});

// 11. Admin Users
export const adminUsers = mysqlTable("admin_users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  role: mysqlEnum("role", ["owner", "staff"]).default("owner").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastLoginAt: datetime("last_login_at"),
  createdAt: datetime("created_at").default(new Date()).notNull(),
});

// 12. Admin Sessions
export const adminSessions = mysqlTable("admin_sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
  adminUserId: int("admin_user_id").notNull(),
  expiresAt: datetime("expires_at").notNull(),
  ip: varchar("ip", { length: 45 }),
  userAgent: varchar("user_agent", { length: 255 }),
  createdAt: datetime("created_at").default(new Date()).notNull(),
});

// 13. Settings (Single Row Store CMS)
export const settings = mysqlTable("settings", {
  id: int("id").primaryKey().default(1),
  storeName: varchar("store_name", { length: 100 }).default("Mol-Mol Purwokerto").notNull(),
  storeTagline: varchar("store_tagline", { length: 255 }).default("Camilan Manis & Gurih Khas Purwokerto"),
  pickupAddress: text("pickup_address"),
  pickupLatitude: decimal("pickup_latitude", { precision: 10, scale: 7 }),
  pickupLongitude: decimal("pickup_longitude", { precision: 10, scale: 7 }),
  pickupMapsUrl: text("pickup_maps_url"),
  logoPath: varchar("logo_path", { length: 255 }),
  qrisImagePath: varchar("qris_image_path", { length: 255 }),
  bankName: varchar("bank_name", { length: 50 }).default("BCA"),
  bankAccountNo: varchar("bank_account_no", { length: 50 }).default("1234567890"),
  bankAccountName: varchar("bank_account_name", { length: 100 }).default("Mol-Mol Purwokerto"),
  bankAccounts: json("bank_accounts").$type<
    Array<{ bankName: string; bankAccountNo: string; bankAccountName: string }>
  >(),
  allowDelivery: boolean("allow_delivery").default(true).notNull(),
  allowCod: boolean("allow_cod").default(false).notNull(),
  flatDeliveryFee: int("flat_delivery_fee").default(10000).notNull(),
  freeDeliveryMin: int("free_delivery_min").default(75000),
  announcementText: text("announcement_text"),
  announcementActive: boolean("announcement_active").default(false).notNull(),
  adminPhone: varchar("admin_phone", { length: 30 }).default("6281234567890").notNull(),
  adminTelegramChatId: varchar("admin_telegram_chat_id", { length: 64 }),
  operationalHours: json("operational_hours").$type<{ open: string; close: string; days: string }>(),
  mapsEmbedUrl: text("maps_embed_url"),
  trackRequirePhone: boolean("track_require_phone").default(false).notNull(),
  updatedAt: datetime("updated_at").default(new Date()).notNull(),
});

// Relations
export const batchesRelations = relations(batches, ({ many }) => ({
  items: many(batchItems),
  orders: many(orders),
}));

export const batchItemsRelations = relations(batchItems, ({ one }) => ({
  batch: one(batches, {
    fields: [batchItems.batchId],
    references: [batches.id],
  }),
  menuItem: one(menuItems, {
    fields: [batchItems.menuItemId],
    references: [menuItems.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  batch: one(batches, {
    fields: [orders.batchId],
    references: [batches.id],
  }),
  items: many(orderItems),
  history: many(orderStatusHistory),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  menuItem: one(menuItems, {
    fields: [orderItems.menuItemId],
    references: [menuItems.id],
  }),
}));
