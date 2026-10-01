import { test, expect } from "@playwright/test";

test.describe("Halaman 404 Not Found Mol-Mol Purwokerto", () => {
  test("menampilkan halaman 404 singkat dan tombol direct ke beranda", async ({
    page,
  }) => {
    // Kunjungi URL acak yang tidak ada
    await page.goto("/halaman-yang-pasti-tidak-ada-12345");

    // Periksa tulisan 404 Not Found
    await expect(page.locator("h1")).toContainText("404");
    await expect(page.locator("text=Not Found")).toBeVisible();

    // Periksa tombol navigasi langsung ke beranda
    const homeBtn = page.locator("main").getByRole("link", { name: "Kembali ke Beranda" });
    await expect(homeBtn).toBeVisible();

    // Klik kembali ke beranda
    await homeBtn.click();
    await expect(page).toHaveURL("/");
  });
});
