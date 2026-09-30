import type { APIEvent } from "@solidjs/start/server";
import { getProductionSummary } from "~/lib/services/order";
import { getActiveBatch, getAllBatches } from "~/lib/services/batch";
import { getAdminFromSession, SESSION_COOKIE_NAME } from "~/lib/auth";

export async function GET(event: APIEvent) {
  try {
    const cookie = event.request.headers.get("cookie") || "";
    const match = cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]*)`));
    const token = match ? decodeURIComponent(match[1]) : null;
    const admin = await getAdminFromSession(token);
    if (!admin) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const url = new URL(event.request.url);
    let batchId = url.searchParams.get("batchId") ? parseInt(url.searchParams.get("batchId")!, 10) : undefined;

    if (!batchId) {
      const active = await getActiveBatch();
      batchId = active ? active.id : undefined;
    }

    if (!batchId) {
      return new Response(JSON.stringify({ summary: [], batch: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const summary = await getProductionSummary(batchId);
    return new Response(JSON.stringify({ summary, batchId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message }), { status: 500 });
  }
}
