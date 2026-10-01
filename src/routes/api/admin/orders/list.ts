import type { APIEvent } from "@solidjs/start/server";
import { getAdminOrders } from "~/lib/services/order";
import { getAdminFromSession, SESSION_COOKIE_NAME } from "~/lib/auth";
import { formatSafeErrorMessage } from "~/lib/debug";

export async function GET(event: APIEvent) {
  try {
    const cookie = event.request.headers.get("cookie") || "";
    const match = cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]*)`));
    const token = match ? decodeURIComponent(match[1]) : null;

    const admin = await getAdminFromSession(token);
    if (!admin) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const url = new URL(event.request.url);
    const status = url.searchParams.get("status") || "all";
    const rawSearch = url.searchParams.get("search") || undefined;
    const search = rawSearch ? rawSearch.slice(0, 100).trim() : undefined;
    const batchIdParam = url.searchParams.get("batchId");
    let batchId: number | undefined;
    if (batchIdParam) {
      const parsed = parseInt(batchIdParam, 10);
      if (!isNaN(parsed) && parsed > 0) {
        batchId = parsed;
      }
    }

    const list = await getAdminOrders({
      status,
      search,
      batchId,
      limit: 100,
    });

    return new Response(JSON.stringify(list), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: formatSafeErrorMessage(err, "Gagal mengambil daftar pesanan.") }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
