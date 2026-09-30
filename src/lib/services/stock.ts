import { sql } from "drizzle-orm";
import { batches, batchItems, stockMovements } from "../db/schema";

export class QuotaExceededError extends Error {
  constructor(message = "Kuota pesanan untuk batch pre-order ini sudah penuh.") {
    super(message);
    this.name = "QuotaExceededError";
  }
}

export class StockInsufficientError extends Error {
  constructor(itemName: string) {
    super(`Stok untuk menu "${itemName}" tidak mencukupi untuk jumlah yang diminta.`);
    this.name = "StockInsufficientError";
  }
}

export class BatchClosedError extends Error {
  constructor(message = "Pemesanan untuk batch pre-order ini sedang ditutup.") {
    super(message);
    this.name = "BatchClosedError";
  }
}

export interface StockReservationItem {
  batchItemId: number;
  menuItemId: number;
  name: string;
  qty: number;
}

/**
 * Logika murni untuk cek ketersediaan stok & kuota sebelum eksekusi database
 */
export function checkStockAvailability(
  batchQuota: { total: number; used: number },
  items: Array<{ id: number; name: string; total: number | null; used: number; requested: number }>
): { available: boolean; error?: string } {
  if (batchQuota.used >= batchQuota.total) {
    return { available: false, error: "Kuota pemesanan batch ini sudah habis." };
  }

  for (const item of items) {
    if (item.requested <= 0) continue;
    if (item.total !== null && item.used + item.requested > item.total) {
      const remaining = Math.max(0, item.total - item.used);
      return {
        available: false,
        error: `Menu "${item.name}" tersisa ${remaining} porsi, tidak cukup untuk pesanan sebanyak ${item.requested} porsi.`,
      };
    }
  }

  return { available: true };
}

/**
 * Reservasi kuota batch dan stok per item secara transaksional di database MySQL
 * Menggunakan atomik conditional UPDATE untuk mencegah race condition.
 */
export async function reserveBatchStock(
  tx: any,
  batchId: number,
  items: StockReservationItem[],
  orderId: string
): Promise<void> {
  // 1. Naikkan kuota batch secara atomik bila masih cukup
  const [batchUpdateResult]: any = await tx.execute(
    sql`UPDATE batches
        SET quota_used = quota_used + 1, updated_at = NOW()
        WHERE id = ${batchId}
          AND status = 'open'
          AND quota_used < quota_total`
  );

  const affectedBatch = batchUpdateResult?.affectedRows ?? batchUpdateResult?.rowCount ?? 0;
  if (affectedBatch === 0) {
    throw new QuotaExceededError();
  }

  // 2. Naikkan stock_used per item secara atomik bila masih cukup
  for (const item of items) {
    const qty = Math.max(1, Math.floor(item.qty));
    const [itemUpdateResult]: any = await tx.execute(
      sql`UPDATE batch_items
          SET stock_used = stock_used + ${qty}
          WHERE id = ${item.batchItemId}
            AND is_available = 1
            AND (stock_total IS NULL OR stock_used + ${qty} <= stock_total)`
    );

    const affectedItem = itemUpdateResult?.affectedRows ?? itemUpdateResult?.rowCount ?? 0;
    if (affectedItem === 0) {
      throw new StockInsufficientError(item.name);
    }

    // Catat pergerakan stok
    await tx.insert(stockMovements).values({
      batchItemId: item.batchItemId,
      delta: -qty,
      reason: "order_created",
      refOrderId: orderId,
      note: `Pengurangan stok dari order ${orderId}`,
      createdAt: new Date(),
    });
  }
}

/**
 * Mengembalikan kuota batch dan stok per item (misalnya saat pesanan dibatalkan / ditolak)
 */
export async function releaseBatchStock(
  tx: any,
  batchId: number,
  items: Array<{ batchItemId: number; qty: number }>,
  orderId: string,
  reason: "order_cancelled" | "correction" = "order_cancelled",
  adminId?: number
): Promise<void> {
  // 1. Kurangi kuota batch terpakai
  await tx.execute(
    sql`UPDATE batches
        SET quota_used = GREATEST(0, quota_used - 1), updated_at = NOW()
        WHERE id = ${batchId}`
  );

  // 2. Kembalikan stok item
  for (const item of items) {
    const qty = Math.max(1, Math.floor(item.qty));
    await tx.execute(
      sql`UPDATE batch_items
          SET stock_used = GREATEST(0, stock_used - ${qty})
          WHERE id = ${item.batchItemId}`
    );

    await tx.insert(stockMovements).values({
      batchItemId: item.batchItemId,
      delta: qty,
      reason: reason,
      refOrderId: orderId,
      actorAdminId: adminId || null,
      note: `Pengembalian stok pesanan ${orderId}`,
      createdAt: new Date(),
    });
  }
}
