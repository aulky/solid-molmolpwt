import type { APIEvent } from "@solidjs/start/server";
import { eq, or, and, desc } from "drizzle-orm";
import { db } from "~/lib/db";
import { orders, telegramSubscriptions, settings } from "~/lib/db/schema";
import { sendTelegramNotification } from "~/lib/telegram";
import { getActiveBatch } from "~/lib/services/batch";
import { formatRupiah, formatTanggalWIB } from "~/lib/pricing";

export async function POST(event: APIEvent) {
  try {
    // 1. Verifikasi secret token jika diset di environment
    const secretHeader = event.request.headers.get("x-telegram-bot-api-secret-token");
    const expectedSecret = process.env.TELEGRAM_SECRET_TOKEN;
    if (expectedSecret && secretHeader !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Invalid secret token" }), { status: 403 });
    }

    const update = await event.request.json();
    const message = update?.message;

    if (!message || !message.text) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    const chatId = String(message.chat.id);
    const text = message.text.trim();
    const username = message.from?.username || message.from?.first_name || null;

    // Periksa status otorisasi admin
    const storeSettingsList = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
    const adminChatId =
      storeSettingsList[0]?.adminTelegramChatId || process.env.TELEGRAM_ADMIN_CHAT_ID;
    const isAdmin = Boolean(adminChatId && chatId === adminChatId);

    // Keyboard Telegram Menu Interaktif
    const botKeyboard = {
      keyboard: [
        [{ text: "/stok" }, { text: "/order" }],
        [{ text: "/pembelian" }, { text: "/status" }],
        [{ text: "/help" }],
      ],
      resize_keyboard: true,
      persistent: true,
    };

    // 1. Perintah: /start [param]
    if (text.startsWith("/start")) {
      const parts = text.split(/\s+/);
      const param = parts[1]?.trim();

      if (!param) {
        await sendTelegramNotification(
          `<b>[LAYANAN BOT NOTIFIKASI MOL-MOL PURWOKERTO]</b>\n\nSelamat datang di Bot Resmi <b>Mol-Mol Purwokerto</b>! 🍪\n\nUntuk memantau status pesanan pre-order, ketik:\n<code>/start KODE_PESANAN</code> (contoh: <code>/start MM-7K2P4Q</code>)\n\nAtau gunakan tombol menu di bawah untuk memeriksa stok, cara order, dan panduan pembelian:`,
          chatId,
          botKeyboard
        );
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      // Cari order berdasarkan UUID atau Short Code
      const cleanParam = param.toUpperCase();
      const foundOrders = await db
        .select()
        .from(orders)
        .where(or(eq(orders.id, param), eq(orders.shortCode, cleanParam)))
        .limit(1);

      if (foundOrders.length === 0) {
        await sendTelegramNotification(
          `<b>[PESANAN TIDAK DITEMUKAN]</b>\n\nKode pesanan <code>${param}</code> tidak terdaftar di sistem Mol-Mol Purwokerto. Mohon periksa kembali kode Anda.`,
          chatId,
          botKeyboard
        );
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      const order = foundOrders[0];

      // Simpan subscription ke database
      const existingSub = await db
        .select()
        .from(telegramSubscriptions)
        .where(
          and(
            eq(telegramSubscriptions.chatId, chatId),
            eq(telegramSubscriptions.orderId, order.id)
          )
        )
        .limit(1);

      if (existingSub.length === 0) {
        await db.insert(telegramSubscriptions).values({
          orderId: order.id,
          chatId,
          username,
          isActive: true,
          createdAt: new Date(),
        });
      } else {
        await db
          .update(telegramSubscriptions)
          .set({ isActive: true })
          .where(eq(telegramSubscriptions.id, existingSub[0].id));
      }

      await sendTelegramNotification(
        `<b>[BERHASIL BERLANGGANAN NOTIFIKASI]</b>\n\nAnda sedang memantau pesanan:\n<b>Kode Pesanan:</b> <code>${order.shortCode}</code>\n<b>Nama Pemesan:</b> ${order.customerName}\n<b>Status Terkini:</b> ${order.status.replace(/_/g, " ").toUpperCase()}\n\nSistem akan mengirimkan pesan otomatis setiap status pesanan ini diperbarui oleh tim Mol-Mol.`,
        chatId,
        botKeyboard
      );

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // 2. Perintah: /stok (Cek kuota batch dan ketersediaan menu)
    if (text === "/stok" || text.toLowerCase().includes("stok")) {
      const activeBatch = await getActiveBatch();

      if (!activeBatch) {
        await sendTelegramNotification(
          `<b>[INFORMASI STOK & KUOTA]</b>\n\nSaat ini belum ada gelombang Pre-Order yang sedang aktif. Silakan pantau pengumuman pembukaan batch berikutnya di website resmi Mol-Mol Purwokerto.`,
          chatId,
          botKeyboard
        );
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      const remainingQuota = Math.max(0, activeBatch.quotaTotal - activeBatch.quotaUsed);

      const itemsList = activeBatch.items
        .map((it: any) => {
          const stockInfo =
            it.remainingStock !== null
              ? `${it.remainingStock} porsi tersisa`
              : "Tersedia (Sesuai kuota batch)";
          return `• <b>${it.name}</b>: ${stockInfo} (${formatRupiah(it.effectivePrice)})`;
        })
        .join("\n");

      const message = [
        `<b>[STATUS STOK & KUOTA PRE-ORDER]</b>`,
        ``,
        `<b>Gelombang:</b> ${activeBatch.code} (${activeBatch.title})`,
        `<b>Kuota Batch:</b> ${activeBatch.quotaUsed} dari ${activeBatch.quotaTotal} slot terisi (Sisa <b>${remainingQuota} slot</b>)`,
        `<b>Batas Pemesanan:</b> ${formatTanggalWIB(activeBatch.orderCloseAt)}`,
        `<b>Tanggal Pengiriman:</b> ${formatTanggalWIB(activeBatch.deliveryDate, { includeTime: false })}`,
        ``,
        `<b>Daftar Menu:</b>\n${itemsList}`,
        ``,
        `Pemesanan dapat langsung dilakukan melalui situs web resmi Mol-Mol Purwokerto. Ketik <code>/order</code> untuk panduan pemesanan.`,
      ].join("\n");

      await sendTelegramNotification(message, chatId, botKeyboard);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // 3. Perintah: /order (Cara pesan & link website)
    if (text === "/order" || text.toLowerCase().includes("order") || text.toLowerCase().includes("pesan")) {
      const baseUrl = process.env.BASE_URL || "http://localhost:3001";
      const activeBatch = await getActiveBatch();
      const batchInfo = activeBatch
        ? `Gelombang aktif saat ini: <b>${activeBatch.title}</b> (${activeBatch.code}).`
        : `Saat ini belum ada gelombang PO terbuka.`;

      const message = [
        `<b>[PANDUAN PEMESANAN PRE-ORDER]</b>`,
        ``,
        `${batchInfo}`,
        ``,
        `<b>Cara Memesan:</b>`,
        `1. Kunjungi website resmi: <a href="${baseUrl}">${baseUrl}</a>`,
        `2. Pilih varian menu Mol-Mol favorit dan atur jumlah pesanan`,
        `3. Buka keranjang lalu klik tombol <b>Checkout Pesanan</b>`,
        `4. <b>Step 1:</b> Masukkan Nama, Nomor WhatsApp, dan Username Telegram`,
        `5. <b>Step 2:</b> Pilih Metode Pengantaran (Pickup/Delivery/COD) & Pembayaran (QRIS/Transfer)`,
        `6. Unggah bukti pembayaran (QRIS/Transfer Bank) dan kirim pesanan`,
        `7. Simpan <b>Kode Pesanan</b> Anda untuk melacak status pesanan`,
        ``,
        `Ketik <code>/pembelian</code> untuk detail rekening & metode bayar.`,
      ].join("\n");

      await sendTelegramNotification(message, chatId, botKeyboard);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // 4. Perintah: /pembelian (Metode bayar, rekening & QRIS)
    if (text === "/pembelian" || text.toLowerCase().includes("pembelian") || text.toLowerCase().includes("bayar")) {
      const store = storeSettingsList[0];
      const bankName = store?.bankName || "BCA";
      const accountNo = store?.bankAccountNo || "0461234567";
      const accountName = store?.bankAccountName || "Mol-Mol Purwokerto";

      const message = [
        `<b>[METODE PEMBAYARAN & PEMBELIAN]</b>`,
        ``,
        `Mol-Mol Purwokerto mendukung metode pembayaran berikut:`,
        ``,
        `<b>1. QRIS (Semua Bank & E-Wallet)</b>`,
        `• Scan barcode QRIS langsung di layar checkout web.`,
        `• Mendukung BCA, Mandiri, BRI, BNI, Dana, GoPay, OVO, ShopeePay, LinkAja.`,
        ``,
        `<b>2. Transfer Bank</b>`,
        `• <b>Bank:</b> ${bankName}`,
        `• <b>Nomor Rekening:</b> <code>${accountNo}</code>`,
        `• <b>Atas Nama:</b> ${accountName}`,
        ``,
        `<b>3. COD (Bayar di Tempat)</b>`,
        `• Khusus layanan kurir lokal area Purwokerto yang mengaktifkan fitur COD.`,
        ``,
        `<i>Setelah transfer/QRIS, pastikan mengunggah foto struk/screenshot bukti transfer di formulir pemesanan.</i>`,
      ].join("\n");

      await sendTelegramNotification(message, chatId, botKeyboard);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // 5. Perintah: /status (Daftar pesanan yang dipantau pengguna)
    if (text === "/status") {
      const subs = await db
        .select({
          orderId: telegramSubscriptions.orderId,
          shortCode: orders.shortCode,
          status: orders.status,
          customerName: orders.customerName,
        })
        .from(telegramSubscriptions)
        .innerJoin(orders, eq(telegramSubscriptions.orderId, orders.id))
        .where(
          and(
            eq(telegramSubscriptions.chatId, chatId),
            eq(telegramSubscriptions.isActive, true)
          )
        );

      if (subs.length === 0) {
        await sendTelegramNotification(
          `<b>[DAFTAR PESANAN ANDA]</b>\n\nAnda belum berlangganan notifikasi untuk pesanan manapun. Gunakan <code>/start KODE_PESANAN</code> (contoh: <code>/start MM-7K2P4Q</code>) untuk mulai memantau.`,
          chatId,
          botKeyboard
        );
      } else {
        const listText = subs
          .map(
            (s) =>
              `• <b>${s.shortCode}</b> (${s.customerName}): <i>${s.status.replace(/_/g, " ").toUpperCase()}</i>`
          )
          .join("\n");

        await sendTelegramNotification(
          `<b>[DAFTAR PESANAN YANG DIPANTAU]</b>\n\n${listText}\n\nKetik <code>/start KODE_PESANAN</code> untuk menambah pesanan lain.`,
          chatId,
          botKeyboard
        );
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // 6. Perintah Khusus Admin: /pesanan
    if (text === "/pesanan" || text.startsWith("/pesanan")) {
      if (!isAdmin) {
        await sendTelegramNotification(
          `<b>[AKSES TERBATAS]</b>\n\nPerintah ini hanya dapat diakses oleh Administrator Toko Mol-Mol Purwokerto.`,
          chatId,
          botKeyboard
        );
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      const pendingOrders = await db
        .select({
          shortCode: orders.shortCode,
          customerName: orders.customerName,
          total: orders.total,
          paymentMethod: orders.paymentMethod,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(eq(orders.status, "menunggu_verifikasi"))
        .orderBy(desc(orders.createdAt))
        .limit(10);

      if (pendingOrders.length === 0) {
        await sendTelegramNotification(
          `<b>[REKAP PESANAN ADMIN]</b>\n\nSaat ini tidak ada pesanan yang menunggu verifikasi bukti bayar. Seluruh pesanan telah diproses.`,
          chatId,
          botKeyboard
        );
      } else {
        const orderLines = pendingOrders
          .map(
            (o) =>
              `• <b>${o.shortCode}</b>: ${o.customerName} - ${formatRupiah(o.total)} (${o.paymentMethod.toUpperCase()})`
          )
          .join("\n");

        await sendTelegramNotification(
          `<b>[PESANAN PERLU VERIFIKASI: ${pendingOrders.length} ORDER]</b>\n\n${orderLines}\n\nSilakan periksa detail bukti bayar di Dashboard Admin.`,
          chatId,
          botKeyboard
        );
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // 7. Perintah: /bantuan atau /help (dan fallback pesan lainnya)
    const adminGuide = isAdmin
      ? `\n\n<b>Perintah Khusus Admin:</b>\n• <code>/pesanan</code> - Cek daftar pesanan yang menunggu verifikasi`
      : "";

    await sendTelegramNotification(
      `<b>[PANDUAN BOT MOL-MOL PURWOKERTO]</b>\n\nBerikut daftar perintah yang dapat Anda gunakan:\n\n• <code>/stok</code> - Cek sisa kuota batch & ketersediaan menu\n• <code>/order</code> - Panduan & link cara pesan pre-order\n• <code>/pembelian</code> - Info metode pembayaran (QRIS, Bank, COD)\n• <code>/status</code> - Daftar pesanan yang sedang Anda pantau\n• <code>/start KODE_PESANAN</code> - Pantau update status pesanan otomatis\n• <code>/help</code> - Menampilkan menu bantuan ini${adminGuide}\n\n<i>Gunakan tombol menu keyboard di bawah layar untuk akses instan.</i>`,
      chatId,
      botKeyboard
    );
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err: any) {
    console.error("Telegram webhook error:", err);
    return new Response(JSON.stringify({ error: err?.message }), { status: 500 });
  }
}
