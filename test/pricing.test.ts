import { describe, it, expect } from "vitest";
import {
  calculateOrderPricing,
  formatRupiah,
  formatTanggalWIB,
  normalizePhone,
  generateShortCode,
} from "../src/lib/pricing";

describe("Pricing and Calculation Functions", () => {
  it("calculates subtotal and delivery fee correctly for pickup", () => {
    const result = calculateOrderPricing({
      items: [
        { unitPrice: 15000, qty: 2 },
        { unitPrice: 20000, qty: 1 },
      ],
      fulfillment: "pickup",
      flatDeliveryFee: 10000,
      freeDeliveryMin: 75000,
    });

    expect(result.subtotal).toBe(50000);
    expect(result.deliveryFee).toBe(0);
    expect(result.total).toBe(50000);
    expect(result.isFreeDelivery).toBe(false);
  });

  it("adds flat delivery fee when subtotal is below freeDeliveryMin threshold", () => {
    const result = calculateOrderPricing({
      items: [
        { unitPrice: 25000, qty: 2 }, // 50,000 < 75,000
      ],
      fulfillment: "delivery",
      flatDeliveryFee: 12000,
      freeDeliveryMin: 75000,
    });

    expect(result.subtotal).toBe(50000);
    expect(result.deliveryFee).toBe(12000);
    expect(result.total).toBe(62000);
    expect(result.isFreeDelivery).toBe(false);
  });

  it("applies free delivery when subtotal meets or exceeds threshold", () => {
    const result = calculateOrderPricing({
      items: [
        { unitPrice: 40000, qty: 2 }, // 80,000 >= 75,000
      ],
      fulfillment: "delivery",
      flatDeliveryFee: 10000,
      freeDeliveryMin: 75000,
    });

    expect(result.subtotal).toBe(80000);
    expect(result.deliveryFee).toBe(0);
    expect(result.total).toBe(80000);
    expect(result.isFreeDelivery).toBe(true);
  });

  it("calculates COD pricing with flat fee if below freeDeliveryMin", () => {
    const result = calculateOrderPricing({
      items: [{ unitPrice: 20000, qty: 2 }],
      fulfillment: "cod",
      flatDeliveryFee: 10000,
      freeDeliveryMin: 75000,
    });

    expect(result.subtotal).toBe(40000);
    expect(result.deliveryFee).toBe(10000);
    expect(result.total).toBe(50000);
  });

  it("correctly handles discounts without resulting in negative total", () => {
    const result = calculateOrderPricing({
      items: [{ unitPrice: 10000, qty: 1 }],
      fulfillment: "pickup",
      discount: 20000,
    });

    expect(result.subtotal).toBe(10000);
    expect(result.discount).toBe(20000);
    expect(result.total).toBe(0);
  });

  it("formats currency to Rupiah correctly", () => {
    expect(formatRupiah(25000)).toMatch(/Rp\s?25\.000/);
    expect(formatRupiah(0)).toMatch(/Rp\s?0/);
  });

  it("formats date to WIB timezone string", () => {
    const date = new Date("2026-10-15T07:00:00.000Z"); // 07:00 UTC = 14:00 WIB
    const formatted = formatTanggalWIB(date);
    expect(formatted).toContain("WIB");
    expect(formatted).toContain("14:00");
  });

  it("normalizes phone numbers to Indonesian standard 628...", () => {
    expect(normalizePhone("081234567890")).toBe("6281234567890");
    expect(normalizePhone("+62 812-3456-7890")).toBe("6281234567890");
    expect(normalizePhone("81234567890")).toBe("6281234567890");
    expect(normalizePhone("6281234567890")).toBe("6281234567890");
  });

  it("generates a valid short code with MM- prefix and 6 chars", () => {
    const code = generateShortCode();
    expect(code).toMatch(/^MM-[2-9A-HJ-NP-Z]{6}$/);
  });
});
