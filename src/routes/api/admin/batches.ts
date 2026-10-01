import type { APIEvent } from "@solidjs/start/server";
import {
  getAllBatches,
  createBatch,
  updateBatch,
  deleteBatch,
  setBatchStatus,
} from "~/lib/services/batch";
import { getAdminFromSession, SESSION_COOKIE_NAME } from "~/lib/auth";
import { formatSafeErrorMessage } from "~/lib/debug";

export async function GET(event: APIEvent) {
  try {
    const list = await getAllBatches();
    return new Response(JSON.stringify(list), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: formatSafeErrorMessage(err, "Gagal mengambil daftar batch.") }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
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
      itemIds: Array.isArray(body.itemIds) ? body.itemIds.map(Number) : undefined,
    });

    return new Response(JSON.stringify({ success: true, id }), { status: 200 });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: formatSafeErrorMessage(err, "Gagal membuat batch baru.") }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
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
    if (!batchId || isNaN(batchId)) {
      return new Response(JSON.stringify({ error: "Batch ID tidak valid" }), { status: 400 });
    }

    // Jika hanya ingin mengubah status secara cepat
    if (body.action === "toggle_status" && body.status) {
      await setBatchStatus(batchId, body.status);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
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
      itemIds: Array.isArray(body.itemIds) ? body.itemIds.map(Number) : undefined,
    });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: formatSafeErrorMessage(err, "Gagal memperbarui batch.") }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function DELETE(event: APIEvent) {
  try {
    const cookie = event.request.headers.get("cookie") || "";
    const match = cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]*)`));
    const token = match ? decodeURIComponent(match[1]) : null;
    const admin = await getAdminFromSession(token);

    if (!admin) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const url = new URL(event.request.url);
    const id = Number(url.searchParams.get("id"));
    if (!id || isNaN(id)) {
      return new Response(JSON.stringify({ error: "ID batch tidak valid" }), { status: 400 });
    }

    await deleteBatch(id);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: formatSafeErrorMessage(err, "Gagal menghapus batch.") }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
