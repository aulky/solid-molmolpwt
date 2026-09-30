import type { APIEvent } from "@solidjs/start/server";
import { getAdminOrders } from "~/lib/services/order";
import { getActiveBatch } from "~/lib/services/batch";
import { getAdminFromSession, SESSION_COOKIE_NAME } from "~/lib/auth";

export async function GET(event: APIEvent) {
  try {
    const cookie = event.request.headers.get("cookie") || "";
    const match = cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]*)`));
    const token = match ? decodeURIComponent(match[1]) : null;

    const admin = await getAdminFromSession(token);
    if (!admin) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    const [recentOrders, activeBatch] = await Promise.all([
      getAdminOrders({ limit: 8 }),
      getActiveBatch(),
    ]);

    const totalRevenue = recentOrders
      .filter((o) => o.status !== "ditolak" && o.status !== "dibatalkan")
      .reduce((sum, o) => sum + o.total, 0);

    const pendingCount = recentOrders.filter(
      (o) => o.status === "menunggu_verifikasi"
    ).length;

    return new Response(
      JSON.stringify({
        recentOrders,
        activeBatch,
        totalRevenue,
        pendingCount,
        totalOrders: recentOrders.length,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (err: any) {
    console.error("Admin dashboard API error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
