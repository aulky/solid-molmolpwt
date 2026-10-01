import crypto from "node:crypto";
import { eq, or, desc, and, sql, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  orders,
  orderItems,
  orderStatusHistory,
  batches,
  batchItems,
  menuItems,
  telegramSubscriptions,
} from "../db/schema";
import {
  checkoutOrderSchema,
  CheckoutOrderInput,
} from "../validation";
import {
  calculateOrderPricing,
  generateShortCode,
} from "../pricing";
import {
  reserveBatchStock,
  releaseBatchStock,
  QuotaExceededError,
  StockInsufficientError,
} from "./stock";
import { notifyAdminNewOrder, notifySubscriberStatusChanged } from "../telegram";
import { getStoreSettings } from "./settings";

export interface CreateOrderResult {
  success: boolean;
  orderId: string;
  shortCode: string;
  total: number;
  customerName: string;
  fulfillment: string;
  error?: string;
}

/**
 * Membuat pesanan pre-order secara transaksional sesuai aturan Fase 4 PLAN.md
 */
export async function createOrder(rawInput: unknown): Promise<CreateOrderResult> {
  const parsed = checkoutOrderSchema.safeParse(rawInput);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(", ");
    throw new Error(`Data pesanan tidak valid: ${msg}`);
  }

  const input: CheckoutOrderInput = parsed.data;

  // Cek Idempotency Key jika dikirim oleh client
  if (input.idempotencyKey) {
    const existing = await db
      .select()
      .from(orders)
      .where(eq(orders.idempotencyKey, input.idempotencyKey))
      .limit(1);

    if (existing.length > 0) {
      return {
        success: true,
        orderId: existing[0].id,
        shortCode: existing[0].shortCode,
        total: existing[0].total,
        customerName: existing[0].customerName,
        fulfillment: existing[0].fulfillment,
      };
    }
  }

  const storeSettings = await getStoreSettings();

  // Buka transaksi database
  return await db.transaction(async (tx) => {
    // 1. Validasi keberadaan batch dan statusnya
    const batchList = await tx
      .select()
      .from(batches)
      .where(eq(batches.id, input.batchId))
      .limit(1);

    if (batchList.length === 0 || batchList[0].status !== "open") {
      throw new Error("Gelombang pre-order ini sudah ditutup atau tidak aktif.");
    }

    const currentBatch = batchList[0];
    const now = new Date();
    if (now > new Date(currentBatch.orderCloseAt)) {
      throw new Error("Batas waktu pemesanan untuk batch ini telah berakhir.");
    }

    // 2. Ambil detail harga snapshot untuk item yang dipesan
    const itemIds = input.items.map((i) => i.batchItemId);
    const dbBatchItems = await tx
      .select({
        batchItemId: batchItems.id,
        menuItemId: menuItems.id,
        name: menuItems.name,
        basePrice: menuItems.basePrice,
        priceOverride: batchItems.priceOverride,
        stockTotal: batchItems.stockTotal,
        stockUsed: batchItems.stockUsed,
        isAvailable: batchItems.isAvailable,
      })
      .from(batchItems)
      .innerJoin(menuItems, eq(batchItems.menuItemId, menuItems.id))
      .where(
        and(
          eq(batchItems.batchId, input.batchId),
          inArray(batchItems.id, itemIds),
          eq(batchItems.isAvailable, true)
        )
      );

    if (dbBatchItems.length !== input.items.length) {
      throw new Error("Salah satu menu yang Anda pilih tidak tersedia dalam batch ini.");
    }

    const itemMap = new Map(dbBatchItems.map((item) => [item.batchItemId, item]));

    // Hitung rincian harga menggunakan fungsi murni calculateOrderPricing
    const pricingItems = input.items.map((item) => {
      const dbItem = itemMap.get(item.batchItemId)!;
      const unitPrice = dbItem.priceOverride ?? dbItem.basePrice;
      return { unitPrice, qty: item.qty };
    });

    const flatFee = currentBatch.deliveryFeeFlat ?? storeSettings.flatDeliveryFee;
    const freeMin = currentBatch.freeDeliveryMin ?? storeSettings.freeDeliveryMin;

    const pricing = calculateOrderPricing({
      items: pricingItems,
      fulfillment: input.fulfillment,
      flatDeliveryFee: flatFee,
      freeDeliveryMin: freeMin,
    });

    const orderId = crypto.randomUUID();
    const shortCode = generateShortCode();

    // 3. Reservasi Kuota dan Stok secara Atomik (mencegah oversell)
    const reservationItems = input.items.map((item) => {
      const dbItem = itemMap.get(item.batchItemId)!;
      return {
        batchItemId: item.batchItemId,
        menuItemId: dbItem.menuItemId,
        name: dbItem.name,
        qty: item.qty,
      };
    });

    await reserveBatchStock(tx, input.batchId, reservationItems, orderId);

    // 4. Simpan Order Utama
    const initialPaymentStatus = input.fulfillment === "cod" ? "unpaid" : "pending_verification";

    await tx.insert(orders).values({
      id: orderId,
      shortCode,
      batchId: input.batchId,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      customerTelegram: input.customerTelegram || null,
      fulfillment: input.fulfillment,
      addressText: input.addressText || null,
      addressNote: input.addressNote || null,
      latitude: input.latitude ? String(input.latitude) : null,
      longitude: input.longitude ? String(input.longitude) : null,
      gpsAccuracyM: input.gpsAccuracyM ?? null,
      locationSource: input.locationSource || null,
      subtotal: pricing.subtotal,
      deliveryFee: pricing.deliveryFee,
      discount: pricing.discount,
      total: pricing.total,
      paymentMethod: input.paymentMethod,
      paymentProofPath: input.paymentProofPath || null,
      paymentStatus: initialPaymentStatus,
      status: "menunggu_verifikasi",
      idempotencyKey: input.idempotencyKey || null,
      createdAt: new Date(),
    });

    // 5. Simpan Order Items (Snapshot nama & harga)
    for (const item of input.items) {
      const dbItem = itemMap.get(item.batchItemId)!;
      const unitPrice = dbItem.priceOverride ?? dbItem.basePrice;
      const lineTotal = unitPrice * item.qty;

      await tx.insert(orderItems).values({
        orderId,
        batchItemId: item.batchItemId,
        menuItemId: dbItem.menuItemId,
        nameSnapshot: dbItem.name,
        unitPrice,
        qty: item.qty,
        lineTotal,
        note: item.note || null,
      });
    }

    // 6. Simpan Riwayat Status Awal
    await tx.insert(orderStatusHistory).values({
      orderId,
      fromStatus: null,
      toStatus: "menunggu_verifikasi",
      actorType: "customer",
      note: "Pesanan baru dibuat oleh pelanggan",
      createdAt: new Date(),
    });

    // 7. Kirim Notifikasi Telegram ke Admin (asinkron tanpa menghambat response)
    const itemsSummary = input.items
      .map((i) => {
        const item = itemMap.get(i.batchItemId)!;
        return `• ${item.name} x${i.qty}`;
      })
      .join("\n");

    notifyAdminNewOrder({
      id: orderId,
      shortCode,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      fulfillment: input.fulfillment,
      addressText: input.addressText,
      latitude: input.latitude,
      longitude: input.longitude,
      itemsSummary,
      total: pricing.total,
      paymentMethod: input.paymentMethod,
      paymentProofUrl: input.paymentProofPath ? `${input.paymentProofPath}` : null,
    }).catch((err) => console.error("Telegram notification error:", err));

    return {
      success: true,
      orderId,
      shortCode,
      total: pricing.total,
      customerName: input.customerName,
      fulfillment: input.fulfillment,
    };
  });
}

/**
 * Mencari pesanan berdasarkan UUID atau Short Code untuk halaman Tracking
 */
export async function getOrderForTracking(query: string, phoneLast4?: string) {
  const cleanQuery = query.trim();
  const rows = await db
    .select()
    .from(orders)
    .where(or(eq(orders.id, cleanQuery), eq(orders.shortCode, cleanQuery.toUpperCase())))
    .limit(1);

  if (rows.length === 0) return null;
  const order = rows[0];

  // Verifikasi 4 digit terakhir nomor HP bila disyaratkan
  if (phoneLast4 && phoneLast4.trim().length === 4) {
    if (!order.customerPhone.endsWith(phoneLast4.trim())) {
      throw new Error("4 digit terakhir nomor HP tidak cocok dengan pesanan ini.");
    }
  }

  // Ambil item
  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));

  // Ambil riwayat status
  const history = await db
    .select()
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, order.id))
    .orderBy(desc(orderStatusHistory.createdAt));

  // Ambil batch terkait untuk informasi tanggal pengiriman
  const batchList = await db
    .select()
    .from(batches)
    .where(eq(batches.id, order.batchId))
    .limit(1);

  return {
    ...order,
    items,
    history,
    batch: batchList[0] || null,
  };
}

/**
 * Mengubah status pesanan oleh admin toko (termasuk pemulihan kuota & stok jika dibatalkan/ditolak)
 */
export async function updateOrderStatus(params: {
  orderId: string;
  newStatus:
    | "menunggu_verifikasi"
    | "dikonfirmasi"
    | "diproduksi"
    | "siap_diambil"
    | "dikirim"
    | "selesai"
    | "ditolak"
    | "dibatalkan";
  adminNote?: string;
  actorAdminId?: number;
}): Promise<void> {
  const { orderId, newStatus, adminNote, actorAdminId } = params;

  await db.transaction(async (tx) => {
    const orderList = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (orderList.length === 0) throw new Error("Pesanan tidak ditemukan.");
    const currentOrder = orderList[0];
    const prevStatus = currentOrder.status;

    if (prevStatus === newStatus) return; // tidak ada perubahan

    const isCancelling = newStatus === "ditolak" || newStatus === "dibatalkan";
    const wasCancelled = prevStatus === "ditolak" || prevStatus === "dibatalkan";

    // Jika dibatalkan/ditolak, kembalikan kuota batch & stok item
    if (isCancelling && !wasCancelled) {
      const items = await tx
        .select({
          batchItemId: orderItems.batchItemId,
          qty: orderItems.qty,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));

      await releaseBatchStock(
        tx,
        currentOrder.batchId,
        items,
        orderId,
        newStatus === "ditolak" ? "order_cancelled" : "order_cancelled",
        actorAdminId
      );
    }

    // Jika sebelumnya ditolak/dibatalkan lalu diaktifkan kembali menjadi dikonfirmasi
    if (wasCancelled && !isCancelling) {
      const items = await tx
        .select({
          batchItemId: orderItems.batchItemId,
          menuItemId: orderItems.menuItemId,
          name: orderItems.nameSnapshot,
          qty: orderItems.qty,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));

      await reserveBatchStock(tx, currentOrder.batchId, items, orderId);
    }

    // Update data order
    const updates: any = {
      status: newStatus,
      adminNote: adminNote ?? currentOrder.adminNote,
    };

    if (newStatus === "dikonfirmasi") {
      updates.verifiedAt = new Date();
      updates.paymentStatus = "verified";
    } else if (newStatus === "selesai") {
      updates.completedAt = new Date();
      updates.paymentStatus = "verified";
    } else if (isCancelling) {
      updates.cancelledAt = new Date();
      updates.cancelReason = adminNote || "Dibatalkan oleh admin";
      if (newStatus === "ditolak") {
        updates.paymentStatus = "rejected";
      }
    }

    await tx.update(orders).set(updates).where(eq(orders.id, orderId));

    // Catat riwayat status
    await tx.insert(orderStatusHistory).values({
      orderId,
      fromStatus: prevStatus,
      toStatus: newStatus,
      actorType: "admin",
      actorAdminId: actorAdminId || null,
      note: adminNote || `Status diubah dari ${prevStatus} ke ${newStatus}`,
      createdAt: new Date(),
    });
  });

  // Notifikasi ke pelanggan yang berlangganan update via Telegram Bot
  try {
    const [targetOrder] = await db
      .select({ shortCode: orders.shortCode })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (targetOrder) {
      const subs = await db
        .select({ chatId: telegramSubscriptions.chatId })
        .from(telegramSubscriptions)
        .where(
          and(
            eq(telegramSubscriptions.orderId, orderId),
            eq(telegramSubscriptions.isActive, true)
          )
        );

      for (const sub of subs) {
        notifySubscriberStatusChanged(sub.chatId, {
          shortCode: targetOrder.shortCode,
          newStatus,
          adminNote,
        }).catch((err) => console.error("Error notifying telegram subscriber:", err));
      }
    }
  } catch (notifyErr) {
    console.warn("Could not dispatch telegram subscriber notification:", notifyErr);
  }
}

/**
 * Daftar pesanan untuk Admin Dashboard dengan filter
 */
export async function getAdminOrders(filters: {
  status?: string;
  batchId?: number;
  search?: string;
  limit?: number;
}) {
  try {
    const conditions: any[] = [];

    if (filters.status && filters.status !== "all") {
      conditions.push(eq(orders.status, filters.status as any));
    }

    if (filters.batchId) {
      conditions.push(eq(orders.batchId, filters.batchId));
    }

    if (filters.search) {
      const term = `%${filters.search.trim()}%`;
      conditions.push(
        or(
          sql`${orders.customerName} LIKE ${term}`,
          sql`${orders.customerPhone} LIKE ${term}`,
          sql`${orders.shortCode} LIKE ${term}`,
          sql`${orders.id} LIKE ${term}`
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const orderRows = await db
      .select({
        id: orders.id,
        shortCode: orders.shortCode,
        batchId: orders.batchId,
        customerName: orders.customerName,
        customerPhone: orders.customerPhone,
        fulfillment: orders.fulfillment,
        addressText: orders.addressText,
        addressNote: orders.addressNote,
        latitude: orders.latitude,
        longitude: orders.longitude,
        gpsAccuracyM: orders.gpsAccuracyM,
        locationSource: orders.locationSource,
        subtotal: orders.subtotal,
        deliveryFee: orders.deliveryFee,
        total: orders.total,
        paymentMethod: orders.paymentMethod,
        paymentStatus: orders.paymentStatus,
        paymentProofPath: orders.paymentProofPath,
        status: orders.status,
        adminNote: orders.adminNote,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(whereClause)
      .orderBy(desc(orders.createdAt))
      .limit(filters.limit || 50);

    if (orderRows.length === 0) return [];

    // Ambil order_items untuk rincian produk pesanan
    const orderIds = orderRows.map((o) => o.id);
    const itemsRows = await db
      .select({
        orderId: orderItems.orderId,
        name: orderItems.nameSnapshot,
        qty: orderItems.qty,
        price: orderItems.unitPrice,
        subtotal: orderItems.lineTotal,
        notes: orderItems.note,
      })
      .from(orderItems)
      .where(inArray(orderItems.orderId, orderIds));

    const itemsMap = new Map<string, any[]>();
    for (const item of itemsRows) {
      if (!itemsMap.has(item.orderId)) {
        itemsMap.set(item.orderId, []);
      }
      itemsMap.get(item.orderId)!.push(item);
    }

    return orderRows.map((o) => ({
      ...o,
      items: itemsMap.get(o.id) || [],
    }));
  } catch (err) {
    console.error("Gagal mengambil data pesanan admin:", err);
    return [];
  }
}

/**
 * Rekap jumlah porsi menu per batch (Halaman Daftar Rekap Produksi)
 * Termasuk rincian nama pemesan dan kuantitas per orang
 */
export async function getProductionSummary(batchId: number) {
  try {
    const validStatuses = ["dikonfirmasi", "diproduksi", "siap_diambil", "dikirim", "selesai"];

    const summary = await db
      .select({
        name: orderItems.nameSnapshot,
        totalQty: sql<number>`CAST(SUM(${orderItems.qty}) AS SIGNED)`,
        totalOrders: sql<number>`COUNT(DISTINCT ${orderItems.orderId})`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(
          eq(orders.batchId, batchId),
          inArray(orders.status, validStatuses as any)
        )
      )
      .groupBy(orderItems.nameSnapshot)
      .orderBy(desc(sql`SUM(${orderItems.qty})`));

    // Ambil rincian nama pemesan untuk tiap varian menu
    const customerBreakdowns = await db
      .select({
        menuName: orderItems.nameSnapshot,
        customerName: orders.customerName,
        customerPhone: orders.customerPhone,
        shortCode: orders.shortCode,
        qty: orderItems.qty,
        notes: orderItems.note,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(
          eq(orders.batchId, batchId),
          inArray(orders.status, validStatuses as any)
        )
      )
      .orderBy(orders.createdAt);

    const customersMap = new Map<string, any[]>();
    for (const row of customerBreakdowns) {
      if (!customersMap.has(row.menuName)) {
        customersMap.set(row.menuName, []);
      }
      customersMap.get(row.menuName)!.push({
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        shortCode: row.shortCode,
        qty: row.qty,
        notes: row.notes,
      });
    }

    return summary.map((item) => ({
      ...item,
      customers: customersMap.get(item.name) || [],
    }));
  } catch (err) {
    console.error("Gagal membuat rekap produksi:", err);
    return [];
  }
}

/**
 * Ekspor pesanan batch ke format CSV untuk label pengiriman & rekap keuangan
 */
export async function exportOrdersCSV(batchId: number): Promise<string> {
  const orderList = await db
    .select()
    .from(orders)
    .where(eq(orders.batchId, batchId))
    .orderBy(desc(orders.createdAt));

  const headers = [
    "Kode Pesanan",
    "Order ID",
    "Nama Pemesan",
    "Nomor WhatsApp",
    "Pengiriman",
    "Alamat",
    "Subtotal",
    "Ongkir",
    "Total",
    "Metode Bayar",
    "Status Bayar",
    "Status Pesanan",
    "Tanggal Pesan",
  ];

  const rows = orderList.map((o) => [
    `"${o.shortCode}"`,
    `"${o.id}"`,
    `"${o.customerName.replace(/"/g, '""')}"`,
    `"${o.customerPhone}"`,
    `"${o.fulfillment}"`,
    `"${(o.addressText || "-").replace(/"/g, '""')}"`,
    o.subtotal,
    o.deliveryFee,
    o.total,
    `"${o.paymentMethod}"`,
    `"${o.paymentStatus}"`,
    `"${o.status}"`,
    `"${new Date(o.createdAt).toISOString()}"`,
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}
