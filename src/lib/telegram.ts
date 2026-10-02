import { formatRupiah } from "./pricing";

/**
 * Escape string untuk aman digunakan dalam format HTML Telegram Bot API
 */
export function escapeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Mengirim pesan teks notifikasi ke Telegram via Telegram Bot API
 */
export async function sendTelegramNotification(
  textHtml: string,
  targetChatId?: string,
  replyMarkup?: any
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = targetChatId || process.env.TELEGRAM_ADMIN_CHAT_ID;

  if (!token || !chatId) {
    // Mode offline / belum dikonfigurasi
    console.warn("Telegram bot token atau targetChatId belum dikonfigurasi.");
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const bodyPayload: any = {
      chat_id: chatId,
      text: textHtml,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };

    if (replyMarkup) {
      bodyPayload.reply_markup = replyMarkup;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyPayload),
    });

    const data = await response.json();
    if (!data.ok) {
      console.error("Telegram API Error:", data.description || data);

      // Fallback: Jika gagal karena entity HTML parsing error, kirim ulang sebagai plain text
      if (typeof data.description === "string" && data.description.includes("can't parse entities")) {
        const plainText = textHtml.replace(/<[^>]*>/g, "");
        const retryRes = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...bodyPayload,
            text: plainText,
            parse_mode: undefined,
          }),
        });
        const retryData = await retryRes.json();
        return !!retryData.ok;
      }
    }
    return !!data.ok;
  } catch (err) {
    console.error("Gagal mengirim notifikasi Telegram:", err);
    return false;
  }
}

/**
 * Ambil daftar user ID dan username yang masuk whitelist Telegram
 */
export function getWhitelistedTelegramUsers(): string[] {
  const envWhitelist = process.env.TELEGRAM_WHITELIST_USERS || "";
  const adminId = process.env.TELEGRAM_ADMIN_CHAT_ID || "";

  const all = `${envWhitelist},${adminId}`
    .split(/[,;\s]+/)
    .map((item) => item.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean);

  return Array.from(new Set(all));
}

/**
 * Periksa apakah user pengirim masuk dalam daftar whitelist Telegram
 */
export function isTelegramUserWhitelisted(
  userId: string | number | undefined | null,
  username?: string | null,
  extraWhitelist?: string[]
): boolean {
  const list = [
    ...getWhitelistedTelegramUsers(),
    ...(extraWhitelist || []).map((s) => s.trim().replace(/^@/, "").toLowerCase()),
  ].filter(Boolean);

  // Jika whitelist tidak dikonfigurasi, semua diizinkan
  if (list.length === 0) return true;

  const idStr = String(userId || "").trim().toLowerCase();
  const unameStr = (username || "").trim().replace(/^@/, "").toLowerCase();

  return (
    (idStr !== "" && list.includes(idStr)) ||
    (unameStr !== "" && list.includes(unameStr))
  );
}

/**
 * Menghasilkan tautan Telegram bot deep-link untuk pelanggan berlangganan status order
 */
export function getTelegramBotDeepLink(orderId: string, botUsername?: string): string | null {
  const username = botUsername || process.env.TELEGRAM_BOT_USERNAME;
  if (!username) return null;
  return `https://t.me/${username}?start=${encodeURIComponent(orderId)}`;
}

/**
 * Format notifikasi order baru untuk admin toko
 */
export async function notifyAdminNewOrder(order: {
  shortCode: string;
  id: string;
  customerName: string;
  customerPhone: string;
  fulfillment: string;
  addressText?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  itemsSummary: string;
  total: number;
  paymentMethod: string;
  paymentProofUrl?: string | null;
}): Promise<void> {
  const mapsLink =
    order.latitude && order.longitude
      ? `https://maps.google.com/?q=${order.latitude},${order.longitude}`
      : null;

  const fulfillmentLabel =
    order.fulfillment === "pickup"
      ? "[PICKUP] Ambil di Tempat"
      : order.fulfillment === "delivery"
      ? "[DELIVERY] Diantar Kurir"
      : "[COD] Bayar di Tempat";

  // Pastikan URL bukti bayar berupa tautan absolut (http/https) agar Telegram API valid memproses tag HTML <a>
  const baseUrl = (process.env.BASE_URL || "http://localhost:3001").replace(/\/+$/, "");
  let proofUrl = order.paymentProofUrl;
  if (proofUrl && !proofUrl.startsWith("http://") && !proofUrl.startsWith("https://")) {
    proofUrl = `${baseUrl}${proofUrl.startsWith("/") ? "" : "/"}${proofUrl}`;
  }

  const message = [
    `<b>[PESANAN PRE-ORDER BARU]</b>`,
    ``,
    `<b>Kode Pesanan:</b> <code>${escapeHtml(order.shortCode)}</code>`,
    `<b>Order ID:</b> <code>${escapeHtml(order.id)}</code>`,
    `<b>Pemesan:</b> ${escapeHtml(order.customerName)} (WA: <a href="https://wa.me/${order.customerPhone}">${escapeHtml(order.customerPhone)}</a>)`,
    `<b>Metode Antar:</b> ${fulfillmentLabel}`,
    order.addressText ? `<b>Alamat:</b> ${escapeHtml(order.addressText)}` : null,
    mapsLink ? `<b>Lokasi GPS:</b> <a href="${mapsLink}">Buka di Google Maps</a>` : null,
    ``,
    `<b>Rincian Menu:</b>\n${escapeHtml(order.itemsSummary)}`,
    ``,
    `<b>Metode Bayar:</b> ${escapeHtml(order.paymentMethod.toUpperCase())}`,
    `<b>Total Tagihan:</b> ${formatRupiah(order.total)}`,
    proofUrl
      ? `<b>Bukti Bayar:</b> <a href="${escapeHtml(proofUrl)}">Lihat Foto Bukti</a>`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  await sendTelegramNotification(message);
}

/**
 * Notifikasi ke pelanggan saat status pesanan mereka berubah (tanpa emoji)
 */
export async function notifySubscriberStatusChanged(
  chatId: string,
  order: {
    shortCode: string;
    newStatus: string;
    adminNote?: string | null;
  }
): Promise<void> {
  const statusLabels: Record<string, string> = {
    menunggu_verifikasi: "[MENUNGGU VERIFIKASI] Bukti pembayaran sedang diverifikasi oleh admin",
    dikonfirmasi: "[DIKONFIRMASI] Pembayaran Anda telah terverifikasi sah",
    diproduksi: "[SEDANG DIPRODUKSI] Pesanan sedang diolah segar oleh tim Mol-Mol",
    siap_diambil: "[SIAP DIAMBIL] Pesanan telah siap di outlet pengambilan",
    dikirim: "[SEDANG DIKIRIM] Pesanan sedang dalam perjalanan bersama kurir",
    selesai: "[SELESAI] Pesanan Anda telah selesai diterima",
    ditolak: "[BUKTI DITOLAK] Bukti transfer tidak valid atau belum masuk",
    dibatalkan: "[DIBATALKAN] Pesanan telah dibatalkan oleh admin",
  };

  const label = statusLabels[order.newStatus] || order.newStatus.toUpperCase();

  const message = [
    `<b>[PEMBARUAN STATUS PESANAN]</b>`,
    ``,
    `<b>Kode Pesanan:</b> <code>${order.shortCode}</code>`,
    `<b>Status Terbaru:</b> ${label}`,
    order.adminNote ? `<b>Catatan Admin:</b> <i>${order.adminNote}</i>` : null,
    ``,
    `Terima kasih telah memesan di <b>Mol-Mol Purwokerto</b>.`,
  ]
    .filter(Boolean)
    .join("\n");

  await sendTelegramNotification(message, chatId);
}
