import type { APIEvent } from "@solidjs/start/server";
import { updateOrderStatus } from "~/lib/services/order";
import { getAdminFromSession, SESSION_COOKIE_NAME } from "~/lib/auth";

export async function POST(event: APIEvent) {
  try {
    const cookie = event.request.headers.get("cookie") || "";
    const match = cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]*)`));
    const token = match ? decodeURIComponent(match[1]) : null;
    const admin = await getAdminFromSession(token);

    if (!admin) {
      return new Response(JSON.stringify({ error: "Sesi admin tidak sah" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await event.request.json();
    const { orderId, newStatus, adminNote } = body;

    if (!orderId || !newStatus) {
      return new Response(JSON.stringify({ error: "Parameter orderId dan newStatus wajib ada" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await updateOrderStatus({
      orderId,
      newStatus,
      adminNote,
      actorAdminId: admin.userId,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Update status error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Gagal mengubah status" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
