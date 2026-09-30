import { formatRupiah } from "./pricing";

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
    return !!data.ok;
  } catch (err) {
    console.error("Gagal mengirim notifikasi Telegram:", err);
    return false;
  }
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

  const message = [
    `<b>[PESANAN PRE-ORDER BARU]</b>`,
    ``,
    `<b>Kode Pesanan:</b> <code>${order.shortCode}</code>`,
    `<b>ID:</b> <code>${order.id}</code>`,
    `<b>Pemesan:</b> ${order.customerName} (WA: <a href="https://wa.me/${order.customerPhone}">${order.customerPhone}</a>)`,
    `<b>Metode Antar:</b> ${fulfillmentLabel}`,
    order.addressText ? `<b>Alamat:</b> ${order.addressText}` : null,
    mapsLink ? `<b>Lokasi GPS:</b> <a href="${mapsLink}">Buka di Google Maps</a>` : null,
    ``,
    `<b>Rincian Menu:</b>\n${order.itemsSummary}`,
    ``,
    `<b>Metode Bayar:</b> ${order.paymentMethod.toUpperCase()}`,
    `<b>Total Tagihan:</b> ${formatRupiah(order.total)}`,
    order.paymentProofUrl
      ? `<b>Bukti Bayar:</b> <a href="${order.paymentProofUrl}">Lihat Foto Bukti</a>`
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
