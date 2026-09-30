import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  notifySubscriberStatusChanged,
  getTelegramBotDeepLink,
} from "../src/lib/telegram";

describe("Telegram Bot Notification & Formatting", () => {
  it("generates correct bot deep-link URL", () => {
    const link = getTelegramBotDeepLink("MM-7K2P4Q", "MolMolPwtBot");
    expect(link).toBe("https://t.me/MolMolPwtBot?start=MM-7K2P4Q");
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
});
