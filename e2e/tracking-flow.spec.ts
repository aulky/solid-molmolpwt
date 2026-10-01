import { test, expect } from "@playwright/test";

test.describe("Alur Pencarian & Pelacakan Pesanan Mol-Mol Purwokerto", () => {
  test("menampilkan form pencarian pelacakan pesanan", async ({ page }) => {
    await page.goto("/track");

    await expect(page.locator("h1")).toContainText("Lacak Pesanan Pre-Order");
    const input = page.locator("input[placeholder*='MM-7K2P4Q']");
    await expect(input).toBeVisible();

    const searchBtn = page.getByRole("button", { name: "Cari Status Pesanan" });
    await expect(searchBtn).toBeVisible();
  });

  test("menampilkan validasi saat input kurang dari 5 karakter", async ({ page }) => {
    await page.goto("/track");

    const input = page.locator("input[placeholder*='MM-7K2P4Q']");
    await input.fill("MM");

    const searchBtn = page.getByRole("button", { name: "Cari Status Pesanan" });
    await searchBtn.click();

    await expect(
      page.locator("text=Masukkan Kode Pesanan (MM-XXXXXX) atau UUID pesanan Anda")
    ).toBeVisible();
  });

  test("mengarahkan ke halaman detail tracking saat kode valid disubmit", async ({ page }) => {
    await page.goto("/track");

    const input = page.locator("input[placeholder*='MM-7K2P4Q']");
    await input.fill("MM-SAMPLE123");

    const searchBtn = page.getByRole("button", { name: "Cari Status Pesanan" });
    await searchBtn.click();

    await expect(page).toHaveURL("/track/MM-SAMPLE123");
  });
});
