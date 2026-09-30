import type { APIEvent } from "@solidjs/start/server";
import { getAllBatches, createBatch, updateBatch } from "~/lib/services/batch";
import { getAdminFromSession, SESSION_COOKIE_NAME } from "~/lib/auth";

export async function GET(event: APIEvent) {
  try {
    const list = await getAllBatches();
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

    if (!admin) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const body = await event.request.json();
    const id = await createBatch({
      code: body.code,
      title: body.title,
      description: body.description,
      orderOpenAt: new Date(body.orderOpenAt),
      orderCloseAt: new Date(body.orderCloseAt),
      deliveryDate: new Date(body.deliveryDate),
      pickupStart: body.pickupStart || "13:00",
      pickupEnd: body.pickupEnd || "17:00",
      pickupAddress: body.pickupAddress || null,
      pickupLatitude: body.pickupLatitude !== undefined ? body.pickupLatitude : null,
      pickupLongitude: body.pickupLongitude !== undefined ? body.pickupLongitude : null,
      pickupMapsUrl: body.pickupMapsUrl || null,
      quotaTotal: Number(body.quotaTotal),
      deliveryFeeFlat: Number(body.deliveryFeeFlat || 10000),
      freeDeliveryMin: body.freeDeliveryMin ? Number(body.freeDeliveryMin) : null,
      allowPickup: body.allowPickup !== undefined ? Boolean(body.allowPickup) : true,
      allowDelivery: body.allowDelivery !== undefined ? Boolean(body.allowDelivery) : true,
      allowCod: body.allowCod !== undefined ? Boolean(body.allowCod) : false,
      status: body.status || "draft",
      itemIds: body.itemIds || [],
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

    if (!admin) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const body = await event.request.json();
    const batchId = Number(body.id);
    if (!batchId) {
      return new Response(JSON.stringify({ error: "Batch ID wajib diisi" }), { status: 400 });
    }

    await updateBatch(batchId, {
      code: body.code,
      title: body.title,
      description: body.description,
      orderOpenAt: body.orderOpenAt ? new Date(body.orderOpenAt) : undefined,
      orderCloseAt: body.orderCloseAt ? new Date(body.orderCloseAt) : undefined,
      deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : undefined,
      pickupStart: body.pickupStart,
      pickupEnd: body.pickupEnd,
      pickupAddress: body.pickupAddress,
      pickupLatitude: body.pickupLatitude !== undefined ? body.pickupLatitude : undefined,
      pickupLongitude: body.pickupLongitude !== undefined ? body.pickupLongitude : undefined,
      pickupMapsUrl: body.pickupMapsUrl,
      quotaTotal: body.quotaTotal ? Number(body.quotaTotal) : undefined,
      deliveryFeeFlat: body.deliveryFeeFlat !== undefined ? Number(body.deliveryFeeFlat) : undefined,
      freeDeliveryMin: body.freeDeliveryMin !== undefined ? (body.freeDeliveryMin ? Number(body.freeDeliveryMin) : null) : undefined,
      allowPickup: body.allowPickup !== undefined ? Boolean(body.allowPickup) : undefined,
      allowDelivery: body.allowDelivery !== undefined ? Boolean(body.allowDelivery) : undefined,
      allowCod: body.allowCod !== undefined ? Boolean(body.allowCod) : undefined,
      status: body.status,
    });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message }), { status: 500 });
  }
}
