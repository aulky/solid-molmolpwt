import { describe, it, expect } from "vitest";
import { checkStockAvailability } from "../src/lib/services/stock";

describe("Stock and Quota Verification Logic", () => {
  it("allows reservation when batch quota and item stock are sufficient", () => {
    const batchQuota = { total: 50, used: 20 };
    const items = [
      { id: 1, name: "Mol-Mol Original", total: 30, used: 10, requested: 5 },
      { id: 2, name: "Mol-Mol Coklat", total: null, used: 15, requested: 2 },
    ];

    const result = checkStockAvailability(batchQuota, items);
    expect(result.available).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("rejects reservation when batch quota is exhausted", () => {
    const batchQuota = { total: 50, used: 50 }; // full!
    const items = [
      { id: 1, name: "Mol-Mol Original", total: 30, used: 10, requested: 1 },
    ];

    const result = checkStockAvailability(batchQuota, items);
    expect(result.available).toBe(false);
    expect(result.error).toContain("Kuota pemesanan batch ini sudah habis");
  });

  it("rejects reservation when item stock is insufficient", () => {
    const batchQuota = { total: 50, used: 10 };
    const items = [
      { id: 1, name: "Mol-Mol Keju", total: 10, used: 8, requested: 5 }, // 8 + 5 = 13 > 10
    ];

    const result = checkStockAvailability(batchQuota, items);
    expect(result.available).toBe(false);
    expect(result.error).toContain('Menu "Mol-Mol Keju" tersisa 2 porsi');
  });

  it("allows unlimited items when total is null", () => {
    const batchQuota = { total: 50, used: 10 };
    const items = [
      { id: 1, name: "Mol-Mol Coklat Lumer", total: null, used: 100, requested: 20 },
    ];

    const result = checkStockAvailability(batchQuota, items);
    expect(result.available).toBe(true);
  });
});
