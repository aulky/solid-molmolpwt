import { describe, it, expect } from "vitest";
import {
  checkoutOrderSchema,
  trackSearchSchema,
  adminLoginSchema,
  batchFormSchema,
} from "../src/lib/validation";

describe("Validation Schemas", () => {
  it("validates a valid pickup checkout order", () => {
    const validData = {
      batchId: 1,
      customerName: "Budi Santoso",
      customerPhone: "081234567890",
      fulfillment: "pickup" as const,
      paymentMethod: "qris" as const,
      paymentProofPath: "/uploads/proofs/sample.webp",
      items: [{ batchItemId: 1, menuItemId: 1, qty: 2 }],
    };

    const parsed = checkoutOrderSchema.safeParse(validData);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.customerPhone).toBe("6281234567890");
    }
  });

  it("fails checkout validation if address is missing for delivery", () => {
    const invalidData = {
      batchId: 1,
      customerName: "Siti Rahma",
      customerPhone: "081234567890",
      fulfillment: "delivery" as const,
      addressText: "", // missing!
      paymentMethod: "qris" as const,
      paymentProofPath: "/uploads/proofs/sample.webp",
      items: [{ batchItemId: 1, menuItemId: 1, qty: 1 }],
    };

    const parsed = checkoutOrderSchema.safeParse(invalidData);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const issue = parsed.error.issues.find((i) => i.path.includes("addressText"));
      expect(issue).toBeDefined();
    }
  });

  it("fails checkout validation if payment proof is missing for non-COD", () => {
    const invalidData = {
      batchId: 1,
      customerName: "Ahmad Dani",
      customerPhone: "081234567890",
      fulfillment: "pickup" as const,
      paymentMethod: "qris" as const,
      paymentProofPath: "", // missing proof!
      items: [{ batchItemId: 1, menuItemId: 1, qty: 1 }],
    };

    const parsed = checkoutOrderSchema.safeParse(invalidData);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const issue = parsed.error.issues.find((i) => i.path.includes("paymentProofPath"));
      expect(issue).toBeDefined();
    }
  });

  it("validates tracking search input", () => {
    expect(trackSearchSchema.safeParse({ query: "MM-7K2P4Q" }).success).toBe(true);
    expect(trackSearchSchema.safeParse({ query: "123" }).success).toBe(false); // too short
  });

  it("validates admin login credentials", () => {
    expect(adminLoginSchema.safeParse({ username: "adm", password: "password123" }).success).toBe(true);
    expect(adminLoginSchema.safeParse({ username: "  admin  ", password: "password123" }).success).toBe(true);
    expect(adminLoginSchema.safeParse({ username: "ad", password: "123" }).success).toBe(false);
    expect(adminLoginSchema.safeParse({ username: "a".repeat(51), password: "password123" }).success).toBe(false);
  });

  it("validates batch PO form data", () => {
    const validBatch = {
      code: "PO-2026-10-A",
      title: "Batch Pre-Order Spesial Oktober",
      orderOpenAt: "2026-10-01T08:00:00",
      orderCloseAt: "2026-10-10T20:00:00",
      deliveryDate: "2026-10-12T10:00:00",
      quotaTotal: 50,
      deliveryFeeFlat: 10000,
      status: "open" as const,
    };

    expect(batchFormSchema.safeParse(validBatch).success).toBe(true);
  });
});
