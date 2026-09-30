import type { APIEvent } from "@solidjs/start/server";
import { exportOrdersCSV } from "~/lib/services/order";

export async function GET(event: APIEvent) {
  try {
    const url = new URL(event.request.url);
    const batchIdParam = url.searchParams.get("batchId");
    if (!batchIdParam) {
      return new Response("Parameter batchId diperlukan", { status: 400 });
    }

    const batchId = parseInt(batchIdParam, 10);
    const csvContent = await exportOrdersCSV(batchId);

    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="rekap-pesanan-batch-${batchId}.csv"`,
      },
    });
  } catch (err: any) {
    return new Response(err?.message || "Gagal mengekspor data", { status: 500 });
  }
}
