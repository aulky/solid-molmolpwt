import { test, expect } from "@playwright/test";

test.describe("Alur Landing Page & Katalog Pre-Order Mol-Mol Purwokerto", () => {
  test("menampilkan header navigasi dan elemen utama landing page", async ({ page }) => {
    await page.goto("/");

    // Periksa Brand Navbar
    await expect(page.locator("header")).toBeVisible();
    await expect(page.locator("header").getByText("Mol-Mol").first()).toBeVisible();
    await expect(page.locator("header").getByText("Purwokerto").first()).toBeVisible();

    // Periksa apakah batch aktif atau tampilan batch kosong yang ditampilkan
    const hasActiveBatch = await page.locator("text=Katalog Pre-Order").isVisible();
    const hasEmptyBatch = await page.locator("text=Belum Ada Gelombang Pre-Order").isVisible();

    // Salah satu dari kondisi ini harus valid (tidak boleh blank)
    expect(hasActiveBatch || hasEmptyBatch).toBe(true);

    if (hasActiveBatch) {
      // Jika ada batch aktif, verifikasi kartu produk
      const productCards = page.locator(".card-surface");
      await expect(productCards.first()).toBeVisible();
    } else {
      // Jika tidak ada batch aktif, verifikasi tombol WhatsApp & informasi toko
      await expect(page.locator("text=Pre-Order Sedang Ditutup")).toBeVisible();
      await expect(page.locator("text=Tanya Jadwal PO via WhatsApp")).toBeVisible();
      await expect(page.locator("text=Lacak Pesanan Sebelumnya")).toBeVisible();
    }
  });

  test("dapat berpindah ke halaman pelacakan dari navbar", async ({ page }) => {
    await page.goto("/");
    const trackNav = page.locator("header a[href='/track']").first();
    await trackNav.click();
    await expect(page).toHaveURL("/track");
    await expect(page.locator("h1")).toContainText("Lacak Pesanan");
  });
});
