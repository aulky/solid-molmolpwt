import type { APIEvent } from "@solidjs/start/server";
import { getStoreSettings, updateStoreSettings } from "~/lib/services/settings";
import { getAdminFromSession, SESSION_COOKIE_NAME } from "~/lib/auth";

export async function GET(event: APIEvent) {
  try {
    const data = await getStoreSettings();
    return new Response(JSON.stringify(data), {
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
    const bankAccounts = Array.isArray(body.bankAccounts) && body.bankAccounts.length > 0
      ? body.bankAccounts
      : [
          {
            bankName: body.bankName || "BCA",
            bankAccountNo: body.bankAccountNo || "",
            bankAccountName: body.bankAccountName || "",
          },
        ];

    await updateStoreSettings({
      storeName: body.storeName,
      storeTagline: body.storeTagline,
      pickupAddress: body.pickupAddress,
      pickupLatitude: body.pickupLatitude !== undefined ? body.pickupLatitude : null,
      pickupLongitude: body.pickupLongitude !== undefined ? body.pickupLongitude : null,
      pickupMapsUrl: body.pickupMapsUrl || null,
      bankName: bankAccounts[0]?.bankName || body.bankName || "BCA",
      bankAccountNo: bankAccounts[0]?.bankAccountNo || body.bankAccountNo || "",
      bankAccountName: bankAccounts[0]?.bankAccountName || body.bankAccountName || "",
      bankAccounts,
      qrisImagePath: body.qrisImagePath,
      flatDeliveryFee: Number(body.flatDeliveryFee),
      freeDeliveryMin: body.freeDeliveryMin ? Number(body.freeDeliveryMin) : null,
      allowDelivery: Boolean(body.allowDelivery),
      allowCod: Boolean(body.allowCod),
      announcementText: body.announcementText,
      announcementActive: Boolean(body.announcementActive),
      adminPhone: body.adminPhone,
      adminTelegramChatId: body.adminTelegramChatId,
      trackRequirePhone: Boolean(body.trackRequirePhone),
    });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message }), { status: 500 });
  }
}
