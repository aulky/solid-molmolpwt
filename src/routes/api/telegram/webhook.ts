import type { APIEvent } from "@solidjs/start/server";
import { eq, or, and, desc } from "drizzle-orm";
import { db } from "~/lib/db";
import { orders, telegramSubscriptions, settings } from "~/lib/db/schema";
import {
  sendTelegramNotification,
  escapeHtml,
  isTelegramUserWhitelisted,
} from "~/lib/telegram";
import { getActiveBatch } from "~/lib/services/batch";
import { formatRupiah, formatTanggalWIB } from "~/lib/pricing";

export async function POST(event: APIEvent) {
  try {
    // 1. Verifikasi secret token jika header dikirimkan dari Telegram
    const secretHeader = event.request.headers.get("x-telegram-bot-api-secret-token");
    const expectedSecret = process.env.TELEGRAM_SECRET_TOKEN;
    if (secretHeader && expectedSecret && secretHeader !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Invalid secret token" }), { status: 403 });
    }

    const update = await event.request.json();
    const message = update?.message || update?.edited_message || update?.callback_query?.message;

    const rawText = (
      message?.text ||
      message?.caption ||
      update?.callback_query?.data ||
      ""
    ).trim();

    if (!rawText) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    const chatId = String(message.chat.id);
    const fromId = String(message.from?.id || message.chat.id);
    const username = message.from?.username || message.from?.first_name || null;

    // Periksa status otorisasi admin dari store settings
    const storeSettingsList = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
    const store = storeSettingsList[0];
    const adminChatId = store?.adminTelegramChatId || process.env.TELEGRAM_ADMIN_CHAT_ID;
    const isAdmin = Boolean(
      adminChatId && (chatId === adminChatId || fromId === adminChatId)
    );

    // 2. Pemeriksaan Akses Whitelist Telegram Pengguna
    const extraWhitelist = store?.adminTelegramChatId ? [store.adminTelegramChatId] : [];
    const isWhitelisted =
      isTelegramUserWhitelisted(fromId, username, extraWhitelist) ||
      isTelegramUserWhitelisted(chatId, username, extraWhitelist);

    if (!isWhitelisted) {
      await sendTelegramNotification(
        `🔒 <b>[AKSES TERBATAS]</b>\n\nMohon maaf, Bot <b>@molmolpwt_bot</b> saat ini dikonfigurasi dalam mode akses khusus (whitelist).\n\n🆔 <b>User ID Telegram Anda:</b> <code>${escapeHtml(fromId)}</code>\n${username ? `👤 <b>Username:</b> @${escapeHtml(username)}\n` : ""}⚠️ <i>User ID Anda belum terdaftar dalam daftar izin. Silakan hubungi admin toko untuk menambahkan ID Anda ke daftar whitelist.</i>`,
        chatId
      );
      return new Response(JSON.stringify({ ok: true, error: "User not whitelisted" }), {
        status: 200,
      });
    }

    // Keyboard Telegram Menu Interaktif dengan Ikon Relevan
    const botKeyboard = {
      keyboard: [
        [{ text: "📦 /stok" }, { text: "🍪 /menu" }],
        [{ text: "📝 /order" }, { text: "💳 /pembelian" }],
        [{ text: "🔍 /status" }, { text: "📍 /lokasi" }],
        [{ text: "📞 /kontak" }, { text: "ℹ️ /help" }],
      ],
      resize_keyboard: true,
      persistent: true,
    };

    // Parsing Command & Argumen (Menangani '/cmd', '📦 /cmd', '/cmd@molmolpwt_bot', dsb.)
    const tokens = rawText.split(/\s+/);
    let cmd = "";
    let arg = "";

    const slashToken = tokens.find((t: string) => t.startsWith("/"));
    if (slashToken) {
      cmd = slashToken.slice(1).split("@")[0].toLowerCase();
      const slashIndex = tokens.indexOf(slashToken);
      arg = tokens.slice(slashIndex + 1).join(" ").trim();
    } else {
      // Deteksi input langsung jika pengguna mengirim kode pesanan MM-XXXXXX atau UUID
      const firstWord = tokens[0] || "";
      const upperWord = firstWord.toUpperCase();
      if (
        /^MM-[A-Z0-9]{4,10}$/i.test(upperWord) ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(firstWord)
      ) {
        cmd = "lacak";
        arg = firstWord;
      } else {
        const lower = rawText.toLowerCase();
        if (lower.includes("stok") || lower.includes("kuota")) cmd = "stok";
        else if (lower.includes("menu") || lower.includes("katalog") || lower.includes("produk")) cmd = "menu";
        else if (lower.includes("order") || lower.includes("cara pesan") || lower.includes("pesan")) cmd = "order";
        else if (lower.includes("status") || lower.includes("lacak") || lower.includes("cek pesanan")) cmd = "status";
        else if (lower.includes("pembelian") || lower.includes("bayar") || lower.includes("rekening") || lower.includes("qris")) cmd = "pembelian";
        else if (lower.includes("lokasi") || lower.includes("alamat") || lower.includes("maps")) cmd = "lokasi";
        else if (lower.includes("kontak") || lower.includes("admin") || lower.includes("whatsapp")) cmd = "kontak";
        else if (lower.includes("pesanan") || lower.includes("rekap")) cmd = "pesanan";
        else cmd = "help";
      }
    }

    // Helper untuk mendaftarkan subscription pesanan
    const subscribeOrder = async (order: any) => {
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
    };

    // 1. Perintah: /start [param]
    if (cmd === "start") {
      if (!arg) {
        await sendTelegramNotification(
          `🍪 <b>SELAMAT DATANG DI BOT MOL-MOL PURWOKERTO</b>\n\nHalo <b>${escapeHtml(username || "Pelanggan Setia")}</b>! 👋\nLayanan bot resmi <b>Mol-Mol Purwokerto</b> siap membantu Anda mengecek stok pre-order, melihat menu, dan memantau pesanan secara otomatis.\n\n🔍 <b>Pantau Pesanan Anda:</b>\nKetik: <code>/lacak KODE_PESANAN</code>\nContoh: <code>/lacak MM-7K2P4Q</code>\n\n👇 <b>Menu Pintas Cepat:</b>\nGunakan tombol keyboard di bawah atau ketik perintah:\n• 📦 <code>/stok</code> — Cek sisa kuota batch & slot PO\n• 🍪 <code>/menu</code> — Lihat varian rasa & harga\n• 📝 <code>/order</code> — Panduan & link cara pesan\n• 💳 <code>/pembelian</code> — Info rekening bank & QRIS\n• 🔍 <code>/status</code> — Daftar pesanan yang Anda pantau\n• 📍 <code>/lokasi</code> — Alamat & titik pickup dapur\n• 📞 <code>/kontak</code> — Hubungi WhatsApp admin\n• ℹ️ <code>/help</code> — Bantuan lengkap perintah bot`,
          chatId,
          botKeyboard
        );
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      // Jika ada parameter kode pesanan (misal dari deep link t.me/bot?start=KODE)
      const cleanParam = arg.toUpperCase();
      const foundOrders = await db
        .select()
        .from(orders)
        .where(or(eq(orders.id, arg), eq(orders.shortCode, cleanParam)))
        .limit(1);

      if (foundOrders.length === 0) {
        await sendTelegramNotification(
          `❌ <b>[PESANAN TIDAK DITEMUKAN]</b>\n\nKode pesanan <code>${escapeHtml(arg)}</code> tidak terdaftar di sistem Mol-Mol Purwokerto. Mohon periksa kembali kode Anda.`,
          chatId,
          botKeyboard
        );
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      const order = foundOrders[0];
      await subscribeOrder(order);

      const statusLabel = order.status.replace(/_/g, " ").toUpperCase();

      await sendTelegramNotification(
        `✅ <b>BERHASIL BERLANGGANAN NOTIFIKASI</b>\n\nPesanan Anda berhasil terhubung dengan akun Telegram ini:\n📦 <b>Kode Pesanan:</b> <code>${escapeHtml(order.shortCode)}</code>\n👤 <b>Nama Pemesan:</b> ${escapeHtml(order.customerName)}\n📊 <b>Status Terkini:</b> <b>${escapeHtml(statusLabel)}</b>\n\n🔔 <i>Sistem akan otomatis mengirimkan pesan ke chat ini setiap kali status pesanan Anda diperbarui oleh tim dapur Mol-Mol Purwokerto.</i>`,
        chatId,
        botKeyboard
      );
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // 2. Perintah: /stok (Cek kuota batch dan ketersediaan menu)
    if (cmd === "stok" || cmd === "stock") {
      const activeBatch = await getActiveBatch();

      if (!activeBatch) {
        await sendTelegramNotification(
          `📦 <b>[INFORMASI STOK & KUOTA]</b>\n\n⚠️ Saat ini belum ada gelombang Pre-Order yang sedang dibuka.\nDapur Mol-Mol Purwokerto membuka pesanan secara berkala untuk menjaga kualitas dan kesegaran produk.\n\n🔔 <i>Pantau pengumuman pembukaan batch berikutnya atau ketik <code>/kontak</code> untuk tanya jadwal PO ke admin.</i>`,
          chatId,
          botKeyboard
        );
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      const remainingQuota = Math.max(0, activeBatch.quotaTotal - activeBatch.quotaUsed);
      const itemsList =
        activeBatch.items.length > 0
          ? activeBatch.items
              .map((it: any) => {
                const stockInfo =
                  it.remainingStock !== null
                    ? `${it.remainingStock} porsi tersisa`
                    : "Tersedia (Sesuai kuota batch)";
                return `• 🍪 <b>${escapeHtml(it.name)}</b>: ${stockInfo} (${formatRupiah(it.effectivePrice)})`;
              })
              .join("\n")
          : "<i>Belum ada item menu yang terhubung.</i>";

      const message = [
        `📦 <b>STATUS KUOTA & JADWAL PRE-ORDER</b>`,
        ``,
        `✨ <b>Gelombang PO:</b> ${escapeHtml(activeBatch.code)} (${escapeHtml(activeBatch.title)})`,
        `📊 <b>Kuota Batch:</b> ${activeBatch.quotaUsed} dari ${activeBatch.quotaTotal} slot terisi (Sisa <b>${remainingQuota} slot</b>)`,
        `⏱️ <b>Batas Tutup PO:</b> ${formatTanggalWIB(activeBatch.orderCloseAt)}`,
        `🚚 <b>Tanggal Pengiriman/Pickup:</b> ${formatTanggalWIB(activeBatch.deliveryDate, { includeTime: false })}`,
        ``,
        `🍪 <b>Daftar Menu:</b>\n${itemsList}`,
        ``,
        `👉 Ketik <code>/order</code> untuk panduan pemesanan melalui website resmi.`,
      ].join("\n");

      await sendTelegramNotification(message, chatId, botKeyboard);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // 3. Perintah: /menu atau /katalog
    if (cmd === "menu" || cmd === "katalog" || cmd === "produk") {
      const activeBatch = await getActiveBatch();

      if (!activeBatch || activeBatch.items.length === 0) {
        await sendTelegramNotification(
          `🍪 <b>[KATALOG MENU PRE-ORDER]</b>\n\n⚠️ Saat ini belum ada menu aktif karena Pre-Order sedang ditutup atau menu sedang disiapkan. Silakan cek berkala atau ketik <code>/stok</code>.`,
          chatId,
          botKeyboard
        );
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      const menuLines = activeBatch.items
        .map((it: any, index: number) => {
          const desc = it.description ? `\n  <i>${escapeHtml(it.description)}</i>` : "";
          return `${index + 1}. 🍪 <b>${escapeHtml(it.name)}</b> — <b>${formatRupiah(it.effectivePrice)}</b>${desc}`;
        })
        .join("\n\n");

      const message = [
        `🍪 <b>KATALOG MENU MOL-MOL PURWOKERTO</b>`,
        ``,
        `Varian rasa spesial untuk gelombang <b>${escapeHtml(activeBatch.title)}</b>:`,
        ``,
        menuLines,
        ``,
        `📝 <i>Pemesanan dilakukan langsung via website. Ketik <code>/order</code> untuk cara memesan.</i>`,
      ].join("\n");

      await sendTelegramNotification(message, chatId, botKeyboard);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // 4. Perintah: /order (Cara pesan & link website)
    if (cmd === "order" || cmd === "pesan") {
      const baseUrl = process.env.BASE_URL || "http://localhost:3001";
      const activeBatch = await getActiveBatch();
      const batchInfo = activeBatch
        ? `✨ Gelombang aktif saat ini: <b>${escapeHtml(activeBatch.title)}</b> (${escapeHtml(activeBatch.code)}).`
        : `⚠️ Saat ini belum ada gelombang PO terbuka.`;

      const message = [
        `📝 <b>PANDUAN PEMESANAN PRE-ORDER</b>`,
        ``,
        `${batchInfo}`,
        ``,
        `🛒 <b>Langkah Mudah Memesan:</b>`,
        `1️⃣ Kunjungi website resmi: <a href="${baseUrl}">${baseUrl}</a>`,
        `2️⃣ Pilih varian menu Mol-Mol favorit dan atur jumlah pesanan`,
        `3️⃣ Buka keranjang lalu klik tombol <b>Checkout Pesanan</b>`,
        `4️⃣ <b>Step 1:</b> Masukkan Nama, Nomor WhatsApp, dan Username Telegram`,
        `5️⃣ <b>Step 2:</b> Pilih Metode Antar (Pickup/Delivery/COD) & Bayar (QRIS/Transfer)`,
        `6️⃣ Unggah foto bukti transfer dan kirim formulir pemesanan`,
        `7️⃣ Simpan <b>Kode Pesanan (MM-XXXXXX)</b> Anda untuk melacak status`,
        ``,
        `🔍 <i>Ketik <code>/lacak KODE</code> untuk memantau status pesanan kapan saja.</i>`,
        `💳 <i>Ketik <code>/pembelian</code> untuk rincian nomor rekening & QRIS toko.</i>`,
      ].join("\n");

      await sendTelegramNotification(message, chatId, botKeyboard);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // 5. Perintah: /pembelian atau /bayar (Metode bayar, rekening & QRIS)
    if (cmd === "pembelian" || cmd === "bayar" || cmd === "rekening" || cmd === "qris") {
      const bankName = store?.bankName || "BCA";
      const accountNo = store?.bankAccountNo || "0461234567";
      const accountName = store?.bankAccountName || "Mol-Mol Purwokerto";

      const message = [
        `💳 <b>METODE PEMBAYARAN & PEMBELIAN</b>`,
        ``,
        `Mol-Mol Purwokerto mendukung metode pembayaran aman berikut:`,
        ``,
        `📱 <b>1. QRIS (Semua Bank & Dompet Digital)</b>`,
        `• Scan barcode QRIS langsung di layar checkout web`,
        `• Mendukung BCA, Mandiri, BRI, BNI, Dana, GoPay, OVO, ShopeePay, LinkAja`,
        ``,
        `🏦 <b>2. Transfer Bank</b>`,
        `• <b>Bank:</b> ${escapeHtml(bankName)}`,
        `• <b>Nomor Rekening:</b> <code>${escapeHtml(accountNo)}</code>`,
        `• <b>Atas Nama:</b> ${escapeHtml(accountName)}`,
        ``,
        `🛵 <b>3. COD (Bayar di Tempat)</b>`,
        `• Khusus opsi pengantaran kurir lokal area Purwokerto yang mengaktifkan fitur COD`,
        ``,
        `⚠️ <i>Setelah transfer/QRIS, pastikan mengunggah foto struk/screenshot bukti transfer di formulir pemesanan web.</i>`,
      ].join("\n");

      await sendTelegramNotification(message, chatId, botKeyboard);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // 6. Perintah: /status atau /lacak atau /cek [kode]
    if (cmd === "status" || cmd === "lacak" || cmd === "cek" || cmd === "track") {
      // Jika menyertakan kode pesanan (contoh: /status MM-7K2P4Q atau /lacak MM-7K2P4Q)
      if (arg) {
        const cleanArg = arg.toUpperCase();
        const found = await db
          .select()
          .from(orders)
          .where(or(eq(orders.id, arg), eq(orders.shortCode, cleanArg)))
          .limit(1);

        if (found.length === 0) {
          await sendTelegramNotification(
            `❌ <b>[PESANAN TIDAK DITEMUKAN]</b>\n\nPesanan dengan kode <code>${escapeHtml(arg)}</code> tidak ditemukan di sistem Mol-Mol Purwokerto. Mohon periksa kembali kode Anda.`,
            chatId,
            botKeyboard
          );
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }

        const o = found[0];
        await subscribeOrder(o);

        const statusLabel = o.status.replace(/_/g, " ").toUpperCase();
        const paymentLabel = o.paymentStatus.replace(/_/g, " ").toUpperCase();

        const message = [
          `🔍 <b>DETAIL STATUS PESANAN</b>`,
          ``,
          `📦 <b>Kode Pesanan:</b> <code>${escapeHtml(o.shortCode)}</code>`,
          `👤 <b>Nama Pemesan:</b> ${escapeHtml(o.customerName)}`,
          `📊 <b>Status Pesanan:</b> <b>${escapeHtml(statusLabel)}</b>`,
          `💳 <b>Status Bayar:</b> ${escapeHtml(paymentLabel)} (${escapeHtml(o.paymentMethod.toUpperCase())})`,
          `🚚 <b>Metode Antar:</b> ${escapeHtml(o.fulfillment.toUpperCase())}`,
          `💰 <b>Total Tagihan:</b> ${formatRupiah(o.total)}`,
          o.adminNote ? `📝 <b>Catatan Toko:</b> ${escapeHtml(o.adminNote)}` : null,
          ``,
          `🔔 <i>Anda otomatis didaftarkan untuk menerima pemberitahuan setiap ada pembaruan status pesanan ini.</i>`,
        ]
          .filter(Boolean)
          .join("\n");

        await sendTelegramNotification(message, chatId, botKeyboard);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      // Jika tanpa argumen, tampilkan daftar pesanan yang sedang dipantau pengguna
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
          `📋 <b>[DAFTAR PESANAN ANDA]</b>\n\n🔍 Anda belum memantau pesanan manapun saat ini.\n\n👉 Ketik:\n<code>/lacak KODE_PESANAN</code> (contoh: <code>/lacak MM-7K2P4Q</code>)\nuntuk mengecek dan memantau status pesanan Anda secara otomatis.`,
          chatId,
          botKeyboard
        );
      } else {
        const listText = subs
          .map(
            (s) =>
              `• 📦 <b>${escapeHtml(s.shortCode)}</b> (${escapeHtml(s.customerName)}): <i>${escapeHtml(s.status.replace(/_/g, " ").toUpperCase())}</i>`
          )
          .join("\n");

        await sendTelegramNotification(
          `📋 <b>[DAFTAR PESANAN YANG DIPANTAU]</b>\n\n${listText}\n\n💡 <i>Ketik <code>/lacak KODE_PESANAN</code> untuk memeriksa detail lengkap pesanan tertentu.</i>`,
          chatId,
          botKeyboard
        );
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // 7. Perintah: /lokasi atau /alamat
    if (cmd === "lokasi" || cmd === "alamat") {
      const address = store?.pickupAddress || "Dapur Mol-Mol Purwokerto, Banyumas, Jawa Tengah";
      const mapsUrl = store?.pickupMapsUrl || "https://maps.google.com/?q=Purwokerto";
      const hours = store?.operationalHours as any;
      const hoursText = hours
        ? `${hours.open || "08:00"} - ${hours.close || "20:00"} WIB (${hours.days || "Setiap Hari"})`
        : "08:00 - 20:00 WIB (Setiap Hari)";

      const message = [
        `📍 <b>LOKASI & TITIK PENGAMBILAN TOKO</b>`,
        ``,
        `🍪 <b>Mol-Mol Purwokerto</b>`,
        `🏠 <b>Alamat Dapur:</b> ${escapeHtml(address)}`,
        `🗺️ <b>Peta Google Maps:</b> <a href="${mapsUrl}">Buka Petunjuk Arah</a>`,
        `⏰ <b>Jam Operasional:</b> ${escapeHtml(hoursText)}`,
        ``,
        `📦 <i>Pengambilan pesanan mandiri (pickup) dilakukan sesuai jadwal tanggal batch PO yang berlaku.</i>`,
      ].join("\n");

      await sendTelegramNotification(message, chatId, botKeyboard);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // 8. Perintah: /kontak atau /admin atau /wa
    if (cmd === "kontak" || cmd === "admin" || cmd === "wa") {
      const phone = store?.adminPhone || "6281234567890";
      const cleanPhone = phone.replace(/[^0-9]/g, "");

      const message = [
        `📞 <b>LAYANAN PELANGGAN & KONTAK ADMIN</b>`,
        ``,
        `Ada pertanyaan seputar menu, kuota batch, atau kendala pemesanan?`,
        ``,
        `💬 <b>WhatsApp Admin:</b> <a href="https://wa.me/${cleanPhone}">+${cleanPhone}</a>`,
        `🌐 <b>Website Resmi:</b> <a href="${process.env.BASE_URL || "http://localhost:3001"}">Mol-Mol Purwokerto</a>`,
        `⏰ <b>Jam Fast Response:</b> 08:00 - 20:00 WIB`,
        ``,
        `<i>Tim admin kami siap melayani pada jam operasional dapur.</i>`,
      ].join("\n");

      await sendTelegramNotification(message, chatId, botKeyboard);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // 9. Perintah Khusus Admin: /pesanan atau /rekap
    if (cmd === "pesanan" || cmd === "rekap") {
      if (!isAdmin) {
        await sendTelegramNotification(
          `🔒 <b>[AKSES TERBATAS]</b>\n\nPerintah ini hanya dapat diakses oleh Administrator Toko Mol-Mol Purwokerto.`,
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
          `🔔 <b>[REKAP PESANAN ADMIN]</b>\n\n✅ Saat ini tidak ada pesanan yang menunggu verifikasi bukti bayar. Seluruh pesanan telah diproses.`,
          chatId,
          botKeyboard
        );
      } else {
        const orderLines = pendingOrders
          .map(
            (o) =>
              `• 📦 <b>${escapeHtml(o.shortCode)}</b>: ${escapeHtml(o.customerName)} — ${formatRupiah(o.total)} (${escapeHtml(o.paymentMethod.toUpperCase())})`
          )
          .join("\n");

        await sendTelegramNotification(
          `🔔 <b>[PESANAN PERLU VERIFIKASI: ${pendingOrders.length} ORDER]</b>\n\n${orderLines}\n\n👉 <i>Silakan periksa detail bukti bayar di Dashboard Admin.</i>`,
          chatId,
          botKeyboard
        );
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    // 10. Perintah: /help atau fallback untuk semua input lainnya
    const adminGuide = isAdmin
      ? `\n\n🔐 <b>Perintah Khusus Admin:</b>\n• 🔔 <code>/pesanan</code> — Cek daftar pesanan yang menunggu verifikasi`
      : "";

    await sendTelegramNotification(
      `ℹ️ <b>PANDUAN BOT MOL-MOL PURWOKERTO</b>\n\nBerikut daftar perintah yang dapat Anda gunakan:\n\n• 📦 <code>/stok</code> — Cek sisa kuota batch & slot PO\n• 🍪 <code>/menu</code> — Lihat varian menu & harga\n• 📝 <code>/order</code> — Panduan & link pemesanan online\n• 💳 <code>/pembelian</code> — Info rekening bank & QRIS\n• 🔍 <code>/lacak KODE</code> — Cek status pesanan Anda\n• 📋 <code>/status</code> — Daftar pesanan yang Anda pantau\n• 📍 <code>/lokasi</code> — Alamat dapur & titik pengambilan\n• 📞 <code>/kontak</code> — Kontak WhatsApp admin toko\n• ℹ️ <code>/help</code> — Menampilkan panduan ini${adminGuide}\n\n💡 <i>Tips: Anda juga bisa langsung mengetik kode pesanan seperti <code>MM-7K2P4Q</code> untuk melacak status pesanan secara instan!</i>`,
      chatId,
      botKeyboard
    );
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err: any) {
    console.error("Telegram webhook error:", err);
    return new Response(JSON.stringify({ error: err?.message }), { status: 500 });
  }
}
