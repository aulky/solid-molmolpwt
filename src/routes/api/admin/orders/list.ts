import type { APIEvent } from "@solidjs/start/server";
import { getAdminOrders } from "~/lib/services/order";
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
        headers: { "Content-Type": "application/json" },
      });
    }

    const url = new URL(event.request.url);
    const status = url.searchParams.get("status") || "all";
    const search = url.searchParams.get("search") || undefined;
    const batchIdParam = url.searchParams.get("batchId");
    const batchId = batchIdParam ? parseInt(batchIdParam, 10) : undefined;

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
    return new Response(JSON.stringify({ error: err?.message }), { status: 500 });
  }
}
