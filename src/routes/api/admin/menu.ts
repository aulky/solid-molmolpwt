import type { APIEvent } from "@solidjs/start/server";
import {
  getAllMenuItems,
  createMenuItem,
  updateMenuItem,
  softDeleteMenuItem,
} from "~/lib/services/menu";
import { getAdminFromSession, SESSION_COOKIE_NAME } from "~/lib/auth";

export async function GET(event: APIEvent) {
  try {
    const list = await getAllMenuItems(true);
    return new Response(JSON.stringify(list), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message }), { status: 500 });
  }
}

export async function POST(event: APIEvent) {
  try {
    const cookie = event.request.headers.get("cookie") || "";
    const match = cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]*)`));
    const token = match ? decodeURIComponent(match[1]) : null;
    const admin = await getAdminFromSession(token);
    if (!admin) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

    const body = await event.request.json();
    const id = await createMenuItem({
      sku: body.sku,
      name: body.name,
      description: body.description,
      basePrice: Number(body.basePrice),
      compareAtPrice: body.compareAtPrice ? Number(body.compareAtPrice) : null,
      weightGrams: Number(body.weightGrams || 250),
      maxPerOrder: Number(body.maxPerOrder || 20),
      categoryId: body.categoryId ? Number(body.categoryId) : null,
      imagePath: body.imagePath,
      images: Array.isArray(body.images) ? body.images : undefined,
      isActive: Boolean(body.isActive),
      isFeatured: Boolean(body.isFeatured),
    });

    return new Response(JSON.stringify({ success: true, id }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message }), { status: 500 });
  }
}

export async function PUT(event: APIEvent) {
  try {
    const cookie = event.request.headers.get("cookie") || "";
    const match = cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]*)`));
    const token = match ? decodeURIComponent(match[1]) : null;
    const admin = await getAdminFromSession(token);
    if (!admin) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

    const body = await event.request.json();
    const id = Number(body.id);
    await updateMenuItem(id, body);

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message }), { status: 500 });
  }
}

export async function DELETE(event: APIEvent) {
  try {
    const cookie = event.request.headers.get("cookie") || "";
    const match = cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]*)`));
    const token = match ? decodeURIComponent(match[1]) : null;
    const admin = await getAdminFromSession(token);
    if (!admin) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

    const url = new URL(event.request.url);
    const id = Number(url.searchParams.get("id"));
    if (!id) return new Response(JSON.stringify({ error: "ID missing" }), { status: 400 });

    await softDeleteMenuItem(id);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message }), { status: 500 });
  }
}
