import { eq, isNull, and, desc } from "drizzle-orm";
import { db } from "../db";
import { menuItems, categories } from "../db/schema";

export async function getAllMenuItems(includeInactive = false) {
  try {
    const conditions = [isNull(menuItems.deletedAt)];
    if (!includeInactive) {
      conditions.push(eq(menuItems.isActive, true));
    }

    return await db
      .select({
        id: menuItems.id,
        sku: menuItems.sku,
        slug: menuItems.slug,
        name: menuItems.name,
        description: menuItems.description,
        categoryId: menuItems.categoryId,
        categoryName: categories.name,
        basePrice: menuItems.basePrice,
        compareAtPrice: menuItems.compareAtPrice,
        weightGrams: menuItems.weightGrams,
        maxPerOrder: menuItems.maxPerOrder,
        imagePath: menuItems.imagePath,
        images: menuItems.images,
        isActive: menuItems.isActive,
        isFeatured: menuItems.isFeatured,
      })
      .from(menuItems)
      .leftJoin(categories, eq(menuItems.categoryId, categories.id))
      .where(and(...conditions))
      .orderBy(desc(menuItems.isFeatured), menuItems.sortOrder, menuItems.name);
  } catch (err) {
    console.error("Gagal mengambil daftar menu:", err);
    return [];
  }
}

export async function getMenuItemById(id: number) {
  const rows = await db
    .select()
    .from(menuItems)
    .where(and(eq(menuItems.id, id), isNull(menuItems.deletedAt)))
    .limit(1);
  return rows[0] || null;
}

export async function createMenuItem(data: {
  sku: string;
  name: string;
  description?: string;
  basePrice: number;
  compareAtPrice?: number | null;
  weightGrams?: number;
  maxPerOrder?: number;
  categoryId?: number | null;
  imagePath?: string;
  images?: string[];
  isActive?: boolean;
  isFeatured?: boolean;
}) {
  const slug = data.name
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");

  const images = Array.isArray(data.images) && data.images.length > 0
    ? data.images.filter(Boolean).slice(0, 4)
    : (data.imagePath ? [data.imagePath] : []);
  const primaryImagePath = images[0] || data.imagePath || null;

  const [res]: any = await db.insert(menuItems).values({
    sku: data.sku,
    slug: `${slug}-${Date.now().toString(36)}`,
    name: data.name,
    description: data.description || null,
    basePrice: data.basePrice,
    compareAtPrice: data.compareAtPrice || null,
    weightGrams: data.weightGrams ?? 250,
    maxPerOrder: data.maxPerOrder ?? 20,
    categoryId: data.categoryId || null,
    imagePath: primaryImagePath,
    images: images.length > 0 ? images : null,
    isActive: data.isActive ?? true,
    isFeatured: data.isFeatured ?? false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return res.insertId;
}

export async function updateMenuItem(
  id: number,
  data: Partial<{
    sku: string;
    name: string;
    description: string;
    basePrice: number;
    compareAtPrice: number | null;
    weightGrams: number;
    maxPerOrder: number;
    categoryId: number | null;
    imagePath: string;
    images: string[];
    isActive: boolean;
    isFeatured: boolean;
  }>
) {
  const updateData: any = { ...data };
  if (data.images !== undefined) {
    const images = Array.isArray(data.images)
      ? data.images.filter(Boolean).slice(0, 4)
      : [];
    updateData.images = images.length > 0 ? images : null;
    if (images.length > 0) {
      updateData.imagePath = images[0];
    } else if (data.imagePath !== undefined) {
      updateData.imagePath = data.imagePath || null;
    }
  }

  await db
    .update(menuItems)
    .set({
      ...updateData,
      updatedAt: new Date(),
    } as any)
    .where(eq(menuItems.id, id));
}

export async function softDeleteMenuItem(id: number) {
  await db
    .update(menuItems)
    .set({ deletedAt: new Date(), isActive: false })
    .where(eq(menuItems.id, id));
}

export async function getAllCategories() {
  try {
    return await db.select().from(categories).where(eq(categories.isActive, true));
  } catch (err) {
    return [];
  }
}
