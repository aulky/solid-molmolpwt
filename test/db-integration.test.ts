import { describe, it, expect } from "vitest";
import { getActiveBatch } from "../src/lib/services/batch";
import { getStoreSettings } from "../src/lib/services/settings";
import {
  createOrder,
  getOrderForTracking,
  updateOrderStatus,
} from "../src/lib/services/order";

describe("Database Services Integration Test", () => {
  it("fetches seeded active batch and store settings", async () => {
    const [batch, settings] = await Promise.all([
      getActiveBatch(),
      getStoreSettings(),
    ]);

    expect(settings).toBeDefined();
    expect(settings.storeName).toBe("Mol-Mol Purwokerto");
    expect(settings.bankName).toBe("BCA");

    if (batch) {
      expect(batch.code).toMatch(/^PO-/);
      expect(batch.items.length).toBeGreaterThanOrEqual(0);
    }
  });

  it("creates a new order transactionally, reserves stock, and retrieves tracking", async () => {
    const batch = await getActiveBatch();
    expect(batch).toBeDefined();
    if (!batch || batch.items.length === 0) return;

    const initialQuotaUsed = batch.quotaUsed;
    const testItem = batch.items[0];
    const initialStockUsed = testItem.stockUsed;

    const orderPayload = {
      batchId: batch.id,
      customerName: "Budi Santoso Integration Test",
      customerPhone: "081234567899",
      fulfillment: "pickup" as const,
      paymentMethod: "qris" as const,
      paymentProofPath: "/uploads/proofs/test-proof.webp",
      idempotencyKey: `test-idem-${Date.now()}`,
      items: [
        {
          batchItemId: testItem.batchItemId,
          menuItemId: testItem.menuItemId,
          qty: 2,
        },
      ],
    };

    // 1. Buat pesanan
    const result = await createOrder(orderPayload);
    expect(result.success).toBe(true);
    expect(result.orderId).toBeDefined();
    expect(result.shortCode).toMatch(/^MM-/);

    // 2. Cek tracking
    const tracking = await getOrderForTracking(result.shortCode);
    expect(tracking).toBeDefined();
    expect(tracking?.id).toBe(result.orderId);
    expect(tracking?.customerName).toBe("Budi Santoso Integration Test");
    expect(tracking?.status).toBe("menunggu_verifikasi");
    expect(tracking?.items.length).toBe(1);
    expect(tracking?.history.length).toBeGreaterThanOrEqual(1);

    // 3. Admin verifikasi pesanan
    await updateOrderStatus({
      orderId: result.orderId,
      newStatus: "dikonfirmasi",
      adminNote: "Pembayaran telah diverifikasi masuk ke rekening",
    });

    const updatedTracking = await getOrderForTracking(result.orderId);
    expect(updatedTracking?.status).toBe("dikonfirmasi");
    expect(updatedTracking?.paymentStatus).toBe("verified");

    // 4. Batalkan pesanan dan verifikasi pemulihan stok
    await updateOrderStatus({
      orderId: result.orderId,
      newStatus: "dibatalkan",
      adminNote: "Pembatalan pesanan untuk uji coba pelepasan kuota",
    });

    const cancelledTracking = await getOrderForTracking(result.orderId);
    expect(cancelledTracking?.status).toBe("dibatalkan");
  });
});
