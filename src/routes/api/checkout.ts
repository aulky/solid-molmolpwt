import type { APIEvent } from "@solidjs/start/server";
import { createOrder } from "~/lib/services/order";
import { formatSafeErrorMessage } from "~/lib/debug";

export async function POST(event: APIEvent) {
  try {
    const body = await event.request.json();
    const result = await createOrder(body);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Checkout API error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: formatSafeErrorMessage(err, "Terjadi kesalahan saat memproses pesanan Anda."),
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
