import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  notifySubscriberStatusChanged,
  notifyAdminNewOrder,
  getTelegramBotDeepLink,
  escapeHtml,
  sendTelegramNotification,
  isTelegramUserWhitelisted,
  getWhitelistedTelegramUsers,
} from "../src/lib/telegram";

describe("Telegram Bot Notification & Formatting", () => {
  it("generates correct bot deep-link URL", () => {
    const link = getTelegramBotDeepLink("MM-7K2P4Q", "molmolpwt_bot");
    expect(link).toBe("https://t.me/molmolpwt_bot?start=MM-7K2P4Q");
  });

  it("checks whitelist with multiple user IDs and usernames correctly", () => {
    process.env.TELEGRAM_WHITELIST_USERS = "931444496, 123456789, @vip_customer";
    process.env.TELEGRAM_ADMIN_CHAT_ID = "999888";

    const whitelisted = getWhitelistedTelegramUsers();
    expect(whitelisted).toContain("931444496");
    expect(whitelisted).toContain("123456789");
    expect(whitelisted).toContain("vip_customer");
    expect(whitelisted).toContain("999888");

    // Whitelisted user ID
    expect(isTelegramUserWhitelisted("931444496", "random_user")).toBe(true);
    expect(isTelegramUserWhitelisted(123456789, null)).toBe(true);

    // Whitelisted username
    expect(isTelegramUserWhitelisted("888888", "vip_customer")).toBe(true);
    expect(isTelegramUserWhitelisted("888888", "@vip_customer")).toBe(true);

    // Non-whitelisted user
    expect(isTelegramUserWhitelisted("777777", "stranger")).toBe(false);
  });

  it("escapes reserved HTML characters properly", () => {
    expect(escapeHtml("Budi & Ani <Toko> \"Purwokerto\"")).toBe(
      "Budi &amp; Ani &lt;Toko&gt; &quot;Purwokerto&quot;"
    );
  });

  it("retries as plain text when Telegram API reports parse error", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test_token";
    process.env.TELEGRAM_ADMIN_CHAT_ID = "123456";

    let callCount = 0;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init: any) => {
      callCount++;
      const body = JSON.parse(init.body);
      if (callCount === 1) {
        return {
          ok: false,
          json: async () => ({
            ok: false,
            description: "Bad Request: can't parse entities: Character '<' is reserved",
          }),
        } as any;
      }
      return {
        ok: true,
        json: async () => ({ ok: true }),
      } as any;
    });

    const res = await sendTelegramNotification("<b>Invalid <tag</b>", "123456");
    expect(res).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    fetchSpy.mockRestore();
  });

  it("formats status update messages without any emoji characters", async () => {
    // Mock global fetch to intercept sendTelegramNotification
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as any);

    process.env.TELEGRAM_BOT_TOKEN = "test_token";
    process.env.TELEGRAM_ADMIN_CHAT_ID = "123456";

    await notifySubscriberStatusChanged("123456", {
      shortCode: "MM-7K2P4Q",
      newStatus: "diproduksi",
      adminNote: "Adonan sedang digoreng",
    });

    expect(fetchSpy).toHaveBeenCalled();
    const requestBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    const messageText: string = requestBody.text;

    // Verify text contains required identifiers
    expect(messageText).toContain("MM-7K2P4Q");
    expect(messageText).toContain("[SEDANG DIPRODUKSI]");
    expect(messageText).toContain("Adonan sedang digoreng");

    // Strictly verify NO emojis exist in the message
    const emojiRegex = /[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(messageText)).toBe(false);

    fetchSpy.mockRestore();
  });

  it("handles incoming webhook update with whitelisted user and rejects non-whitelisted user", async () => {
    const { POST } = await import("../src/routes/api/telegram/webhook");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as any);

    process.env.TELEGRAM_BOT_TOKEN = "test_token";
    process.env.TELEGRAM_ADMIN_CHAT_ID = "931444496";
    process.env.TELEGRAM_WHITELIST_USERS = "931444496, 555666";

    // 1. Whitelisted user sends /help
    const reqWhitelisted = new Request("http://localhost:3001/api/telegram/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          chat: { id: 931444496 },
          from: { id: 931444496, username: "aelyn4k" },
          text: "/help",
        },
      }),
    });

    const resWhitelisted = await POST({ request: reqWhitelisted } as any);
    expect(resWhitelisted.status).toBe(200);
    const bodyWhitelisted = await resWhitelisted.json();
    expect(bodyWhitelisted.ok).toBe(true);
    expect(bodyWhitelisted.error).toBeUndefined();

    // 2. Non-whitelisted user sends /help
    const reqStranger = new Request("http://localhost:3001/api/telegram/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          chat: { id: 999999 },
          from: { id: 999999, username: "unknown_person" },
          text: "/help",
        },
      }),
    });

    const resStranger = await POST({ request: reqStranger } as any);
    expect(resStranger.status).toBe(200);
    const bodyStranger = await resStranger.json();
    expect(bodyStranger.error).toBe("User not whitelisted");

    fetchSpy.mockRestore();
  });

  it("formats notifyAdminNewOrder with absolute hyperlink for Bukti Bayar", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    } as any);

    process.env.TELEGRAM_BOT_TOKEN = "test_token";
    process.env.TELEGRAM_ADMIN_CHAT_ID = "123456";
    process.env.BASE_URL = "http://localhost:3001";

    await notifyAdminNewOrder({
      shortCode: "MM-4XZ98K",
      id: "abc-123-uuid",
      customerName: "Budi Santoso",
      customerPhone: "081234567890",
      fulfillment: "delivery",
      addressText: "Jl. HR Bunyamin No. 10",
      latitude: -7.4243,
      longitude: 109.2486,
      itemsSummary: "• Mol-Mol Coklat Keju x2",
      total: 50000,
      paymentMethod: "qris",
      paymentProofUrl: "/uploads/proofs/1727827438-test.jpg",
    });

    expect(fetchSpy).toHaveBeenCalled();
    const requestBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    const messageText: string = requestBody.text;

    expect(messageText).toContain("MM-4XZ98K");
    expect(messageText).toContain("<b>Order ID:</b> <code>abc-123-uuid</code>");
    expect(messageText).toContain(
      '<b>Bukti Bayar:</b> <a href="http://localhost:3001/uploads/proofs/1727827438-test.jpg">Lihat Foto Bukti</a>'
    );

    fetchSpy.mockRestore();
  });
});
