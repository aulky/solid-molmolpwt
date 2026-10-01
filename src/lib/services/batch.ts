import { eq, desc, and, isNull } from "drizzle-orm";
import { db } from "../db";
import { batches, batchItems, menuItems, orders } from "../db/schema";

export async function getActiveBatch() {
  try {
    const now = new Date();
    const rows = await db
      .select()
      .from(batches)
      .where(eq(batches.status, "open"))
      .orderBy(desc(batches.createdAt))
      .limit(1);

    if (rows.length === 0) return null;
    const batch = rows[0];

    // Ambil item menu yang aktif untuk batch ini
    const items = await db
      .select({
        batchItemId: batchItems.id,
        menuItemId: menuItems.id,
        sku: menuItems.sku,
        name: menuItems.name,
        description: menuItems.description,
        basePrice: menuItems.basePrice,
        priceOverride: batchItems.priceOverride,
        stockTotal: batchItems.stockTotal,
        stockUsed: batchItems.stockUsed,
        isAvailable: batchItems.isAvailable,
        imagePath: menuItems.imagePath,
        images: menuItems.images,
        weightGrams: menuItems.weightGrams,
        maxPerOrder: menuItems.maxPerOrder,
      })
      .from(batchItems)
      .innerJoin(menuItems, eq(batchItems.menuItemId, menuItems.id))
      .where(
        and(
          eq(batchItems.batchId, batch.id),
          eq(batchItems.isAvailable, true),
          isNull(menuItems.deletedAt),
          eq(menuItems.isActive, true)
        )
      );

    // Hitung sisa stok dan harga efektif
    const itemsWithStock = items.map((item) => {
      const effectivePrice = item.priceOverride ?? item.basePrice;
      const remainingStock =
        item.stockTotal !== null ? Math.max(0, item.stockTotal - item.stockUsed) : null;
      const isOutOfStock = remainingStock !== null && remainingStock <= 0;

      const rawImages = (item.images as string[]) || [];
      const finalImages = rawImages.length > 0
        ? rawImages
        : item.imagePath ? [item.imagePath] : [];

      return {
        ...item,
        effectivePrice,
        remainingStock,
        isOutOfStock,
        images: finalImages,
      };
    });

    return {
      ...batch,
      items: itemsWithStock,
    };
  } catch (err) {
    console.error("Gagal mengambil batch aktif:", err);
    return null;
  }
}

export async function getAllActiveBatches() {
  try {
    const rows = await db
      .select()
      .from(batches)
      .where(eq(batches.status, "open"))
      .orderBy(desc(batches.createdAt));

    if (rows.length === 0) return [];

    const result = [];
    for (const batch of rows) {
      const items = await db
        .select({
          batchItemId: batchItems.id,
          menuItemId: menuItems.id,
          sku: menuItems.sku,
          name: menuItems.name,
          description: menuItems.description,
          basePrice: menuItems.basePrice,
          priceOverride: batchItems.priceOverride,
          stockTotal: batchItems.stockTotal,
          stockUsed: batchItems.stockUsed,
          isAvailable: batchItems.isAvailable,
          imagePath: menuItems.imagePath,
          images: menuItems.images,
          weightGrams: menuItems.weightGrams,
          maxPerOrder: menuItems.maxPerOrder,
        })
        .from(batchItems)
        .innerJoin(menuItems, eq(batchItems.menuItemId, menuItems.id))
        .where(
          and(
            eq(batchItems.batchId, batch.id),
            eq(batchItems.isAvailable, true),
            isNull(menuItems.deletedAt),
            eq(menuItems.isActive, true)
          )
        );

      const itemsWithStock = items.map((item) => {
        const effectivePrice = item.priceOverride ?? item.basePrice;
        const remainingStock =
          item.stockTotal !== null ? Math.max(0, item.stockTotal - item.stockUsed) : null;
        const isOutOfStock = remainingStock !== null && remainingStock <= 0;

        const rawImages = (item.images as string[]) || [];
        const finalImages =
          rawImages.length > 0 ? rawImages : item.imagePath ? [item.imagePath] : [];

        return {
          ...item,
          effectivePrice,
          remainingStock,
          isOutOfStock,
          images: finalImages,
        };
      });

      result.push({
        ...batch,
        items: itemsWithStock,
      });
    }

    return result;
  } catch (err) {
    console.error("Gagal mengambil daftar batch aktif:", err);
    return [];
  }
}

export async function getAllBatches() {
  try {
    return await db.select().from(batches).orderBy(desc(batches.createdAt));
  } catch (err) {
    console.error("Gagal mengambil semua batch:", err);
    return [];
  }
}

export async function getBatchDetail(batchId: number) {
  const batchList = await db.select().from(batches).where(eq(batches.id, batchId)).limit(1);
  if (batchList.length === 0) return null;
  const batch = batchList[0];

  const items = await db
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
    .where(eq(batchItems.batchId, batchId));

  return {
    ...batch,
    items,
  };
}

export async function createBatch(data: {
  code: string;
  title: string;
  description?: string;
  orderOpenAt: Date;
  orderCloseAt: Date;
  deliveryDate: Date;
  pickupStart?: string;
  pickupEnd?: string;
  pickupAddress?: string | null;
  pickupLatitude?: number | string | null;
  pickupLongitude?: number | string | null;
  pickupMapsUrl?: string | null;
  quotaTotal: number;
  deliveryFeeFlat?: number;
  freeDeliveryMin?: number | null;
  allowPickup?: boolean;
  allowDelivery?: boolean;
  allowCod?: boolean;
  status?: "draft" | "open" | "closed" | "production" | "delivered" | "cancelled";
  itemIds?: number[];
}) {
  const slug = data.title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");

  const [res]: any = await db.insert(batches).values({
    code: data.code,
    title: data.title,
    slug: `${slug}-${Date.now().toString(36)}`,
    description: data.description || null,
    orderOpenAt: data.orderOpenAt,
    orderCloseAt: data.orderCloseAt,
    deliveryDate: data.deliveryDate,
    pickupStart: data.pickupStart || "13:00",
    pickupEnd: data.pickupEnd || "17:00",
    pickupAddress: data.pickupAddress || null,
    pickupLatitude: data.pickupLatitude !== undefined ? (data.pickupLatitude as any) : null,
    pickupLongitude: data.pickupLongitude !== undefined ? (data.pickupLongitude as any) : null,
    pickupMapsUrl: data.pickupMapsUrl || null,
    quotaTotal: data.quotaTotal,
    quotaUsed: 0,
    deliveryFeeFlat: data.deliveryFeeFlat ?? 10000,
    freeDeliveryMin: data.freeDeliveryMin ?? 75000,
    allowPickup: data.allowPickup ?? true,
    allowDelivery: data.allowDelivery ?? true,
    allowCod: data.allowCod ?? false,
    status: data.status || "draft",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const newBatchId = res.insertId;

  // Jika menyertakan itemIds, kaitkan ke batchItems
  if (data.itemIds && data.itemIds.length > 0) {
    for (const mId of data.itemIds) {
      await db.insert(batchItems).values({
        batchId: newBatchId,
        menuItemId: mId,
        isAvailable: true,
      });
    }
  }

  return newBatchId;
}

export async function updateBatch(
  batchId: number,
  data: Partial<{
    code: string;
    title: string;
    description: string;
    orderOpenAt: Date;
    orderCloseAt: Date;
    deliveryDate: Date;
    pickupStart: string;
    pickupEnd: string;
    pickupAddress: string | null;
    pickupLatitude: number | string | null;
    pickupLongitude: number | string | null;
    pickupMapsUrl: string | null;
    quotaTotal: number;
    deliveryFeeFlat: number;
    freeDeliveryMin: number | null;
    allowPickup: boolean;
    allowDelivery: boolean;
    allowCod: boolean;
    status: "draft" | "open" | "closed" | "production" | "delivered" | "cancelled";
  }>
) {
  await db
    .update(batches)
    .set({
      ...data,
      updatedAt: new Date(),
    } as any)
    .where(eq(batches.id, batchId));
}

export async function updateBatchItemStock(
  batchItemId: number,
  stockTotal: number | null,
  isAvailable: boolean
) {
  await db
    .update(batchItems)
    .set({
      stockTotal,
      isAvailable,
    })
    .where(eq(batchItems.id, batchItemId));
}

export async function deleteBatch(batchId: number) {
  // Periksa apakah batch ini memiliki relasi pesanan
  const relatedOrders = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.batchId, batchId))
    .limit(1);

  if (relatedOrders.length > 0) {
    throw new Error(
      "Batch tidak dapat dihapus permanen karena sudah memiliki riwayat pesanan. Anda dapat mengubah statusnya menjadi 'closed' atau 'cancelled'."
    );
  }

  // Hapus item-item dalam batch terlebih dahulu
  await db.delete(batchItems).where(eq(batchItems.batchId, batchId));

  // Hapus batch dari database
  await db.delete(batches).where(eq(batches.id, batchId));
  return true;
}
