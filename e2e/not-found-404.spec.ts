import { test, expect } from "@playwright/test";

test.describe("Halaman 404 Not Found Mol-Mol Purwokerto", () => {
  test("menampilkan halaman 404 kustom yang sesuai tema dan navigasi kembali ke beranda", async ({
    page,
  }) => {
    // Kunjungi URL acak yang tidak ada
    await page.goto("/halaman-yang-pasti-tidak-ada-12345");

    // Periksa judul dan badge 404
        await expect(page.locator("text=HTTP 404 • Not Found")).toBeVisible();
    await expect(page.locator("h1")).toContainText("Halaman Tidak Ditemukan");
    await expect(page.getByText("Mol-Mol Purwokerto", { exact: true })).toBeVisible();

    // Periksa tombol navigasi di dalam container main
    const homeBtn = page.locator("main").getByRole("link", { name: "Kembali ke Beranda" });
    const trackBtn = page.locator("main").getByRole("link", { name: "Lacak Pesanan" });
    await expect(homeBtn).toBeVisible();
    await expect(trackBtn).toBeVisible();

    // Klik kembali ke beranda
    await homeBtn.click();
    await expect(page).toHaveURL("/");
  });
});
