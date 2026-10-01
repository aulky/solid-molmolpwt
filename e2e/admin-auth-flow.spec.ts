import { test, expect } from "@playwright/test";

test.describe("Alur Otentikasi & Dashboard Admin Mol-Mol Purwokerto", () => {
  test("menolak login jika username atau password salah", async ({ page }) => {
    await page.goto("/admin/login");

    await expect(page.locator("h1")).toContainText("Login Admin Mol-Mol");

    await page.fill("#username", "invalid_admin_user");
    await page.fill("#password", "wrong_password_123");
    await page.click("button[type='submit']");

    await expect(page.locator("text=Username atau password salah")).toBeVisible();
    await expect(page).toHaveURL("/admin/login");
  });

  test("berhasil login dengan kredensial admin dan navigasi cepat antar menu dashboard", async ({
    page,
  }) => {
    await page.goto("/admin/login");

    await page.fill("#username", "admin");
    await page.fill("#password", "admin123");
    await page.click("button[type='submit']");

    // Menunggu navigasi ke /admin
    await page.waitForURL("/admin");
    await expect(
      page.getByRole("heading", { name: "Overview Penjualan & Pre-Order" })
    ).toBeVisible();

    // Navigasi ke menu 'Gelombang Batch PO'
    const batchesNav = page.locator("aside a[href='/admin/batches']").first();
    await batchesNav.click();
    await expect(page).toHaveURL("/admin/batches");
    await expect(
      page.getByRole("heading", { name: "Manajemen Gelombang Pre-Order" })
    ).toBeVisible();

    // Navigasi ke menu 'Katalog Menu'
    const menuNav = page.locator("aside a[href='/admin/menu']").first();
    await menuNav.click();
    await expect(page).toHaveURL("/admin/menu");
    await expect(
      page.getByRole("heading", { name: "Katalog Menu Produk" })
    ).toBeVisible();

    // Pastikan tidak ada spinner blocking yang tertahan
    await expect(page.locator("text=Memeriksa sesi admin...")).not.toBeVisible();

    // Logout dari header dashboard
    const logoutBtn = page.locator("header button", { hasText: "Keluar" });
    await logoutBtn.click();
    await expect(page).toHaveURL("/admin/login");
    await expect(page.locator("h1")).toContainText("Login Admin Mol-Mol");
  });
});
