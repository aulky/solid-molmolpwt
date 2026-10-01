import { eq, desc, and, isNull } from "drizzle-orm";
import { db } from "../db";
import { batches, batchItems, menuItems, orders } from "../db/schema";

export async function getActiveBatch() {
  try {
    const rows = await db
      .select()
      .from(batches)
      .where(eq(batches.status, "open"))
      .orderBy(desc(batches.createdAt))
      .limit(1);

    if (rows.length === 0) return null;
    const batch = rows[0];

    // Ambil item menu yang aktif untuk batch ini
    let items = await db
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

    // Jika batch belum memiliki item terhubung di batch_items, tautkan otomatis semua menu aktif
    if (items.length === 0) {
      await syncBatchItems(batch.id);
      items = await db
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
    }

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
      let items = await db
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

      if (items.length === 0) {
        await syncBatchItems(batch.id);
        items = await db
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
      }

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

/**
 * Sinkronisasi daftar menu item yang dibuka untuk batch tertentu
 * Jika itemIds diberikan, hanya itemIds tersebut yang diatur isAvailable=true.
 * Jika itemIds tidak diberikan (undefined), otomatis aktifkan seluruh menu aktif.
 */
export async function syncBatchItems(batchId: number, itemIds?: number[]) {
  const allActiveMenus = await db
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(and(isNull(menuItems.deletedAt), eq(menuItems.isActive, true)));

  const existingBatchItems = await db
    .select({ id: batchItems.id, menuItemId: batchItems.menuItemId })
    .from(batchItems)
    .where(eq(batchItems.batchId, batchId));

  const existingMap = new Map<number, number>();
  for (const bi of existingBatchItems) {
    existingMap.set(bi.menuItemId, bi.id);
  }

  // Jika itemIds tidak ditentukan (undefined), aktifkan semua menu yang aktif
  const targetItemIds = itemIds !== undefined ? itemIds : allActiveMenus.map((m) => m.id);
  const targetSet = new Set(targetItemIds);

  for (const m of allActiveMenus) {
    const shouldBeAvailable = targetSet.has(m.id);
    const existingId = existingMap.get(m.id);

    if (existingId) {
      await db
        .update(batchItems)
        .set({ isAvailable: shouldBeAvailable })
        .where(eq(batchItems.id, existingId));
    } else if (shouldBeAvailable) {
      await db.insert(batchItems).values({
        batchId,
        menuItemId: m.id,
        isAvailable: true,
      });
    }
  }

  // Nonaktifkan item yang sudah tidak lagi berada di menuItems aktif
  for (const bi of existingBatchItems) {
    const isStillActive = allActiveMenus.some((m) => m.id === bi.menuItemId);
    if (!isStillActive) {
      await db
        .update(batchItems)
        .set({ isAvailable: false })
        .where(eq(batchItems.id, bi.id));
    }
  }
}

export async function getAllBatches() {
  try {
    const rows = await db.select().from(batches).orderBy(desc(batches.createdAt));
    const result = [];
    for (const b of rows) {
      const bItems = await db
        .select({
          id: batchItems.id,
          menuItemId: batchItems.menuItemId,
          isAvailable: batchItems.isAvailable,
        })
        .from(batchItems)
        .where(eq(batchItems.batchId, b.id));

      const selectedItemIds = bItems
        .filter((bi) => bi.isAvailable)
        .map((bi) => bi.menuItemId);

      result.push({
        ...b,
        selectedItemIds,
        activeItemCount: selectedItemIds.length,
      });
    }
    return result;
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
    .where(and(eq(batchItems.batchId, batchId), isNull(menuItems.deletedAt)));

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

  // Sinkronisasi itemIds yang dipilih ke batchItems
  await syncBatchItems(newBatchId, data.itemIds);

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
    itemIds?: number[];
  }>
) {
  const { itemIds, ...batchFields } = data;

  if (Object.keys(batchFields).length > 0) {
    await db
      .update(batches)
      .set({
        ...batchFields,
        updatedAt: new Date(),
      } as any)
      .where(eq(batches.id, batchId));
  }

  if (itemIds !== undefined) {
    await syncBatchItems(batchId, itemIds);
  }
}

export async function setBatchStatus(
  batchId: number,
  status: "draft" | "open" | "closed" | "production" | "delivered" | "cancelled"
) {
  await db
    .update(batches)
    .set({ status, updatedAt: new Date() })
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
