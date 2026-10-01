import * as dotenv from "dotenv";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const webhookUrl = process.env.BASE_URL
  ? `${process.env.BASE_URL}/api/telegram/webhook`
  : "http://localhost:3001/api/telegram/webhook";
const secretToken = process.env.TELEGRAM_SECRET_TOKEN;

if (!token) {
  console.error("❌ ERROR: TELEGRAM_BOT_TOKEN belum dikonfigurasi di file .env");
  process.exit(1);
}

console.log("=================================================");
console.log("🤖 MOL-MOL PURWOKERTO TELEGRAM BOT (POLLING MODE)");
console.log(`📌 Username Bot : @${process.env.TELEGRAM_BOT_USERNAME || "molmolpwt_bot"}`);
console.log(`🎯 Target Webhook: ${webhookUrl}`);
console.log(`🛡️ Whitelist     : ${process.env.TELEGRAM_WHITELIST_USERS || "(Semua user diizinkan)"}`);
console.log("=================================================\n");

let offset = 0;
let isRunning = true;

async function preparePolling() {
  try {
    // Hapus webhook agar mode getUpdates (polling) diizinkan oleh Telegram API
    console.log("🔄 Mempersiapkan polling (menghapus webhook aktif jika ada)...");
    const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`);
    const data = await res.json();
    if (data.ok) {
      console.log("✅ Siap menerima pesan dari Telegram!\n");
    } else {
      console.warn("⚠️ Warning saat deleteWebhook:", data);
    }
  } catch (err: any) {
    console.error("❌ Gagal terhubung ke Telegram API:", err.message);
  }
}

async function pollUpdates() {
  while (isRunning) {
    try {
      const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=15`;
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`⚠️ Telegram getUpdates error HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }

      const json = await res.json();
      if (!json.ok) {
        console.error("⚠️ Telegram getUpdates data error:", json);
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }

      const updates: any[] = json.result || [];
      for (const update of updates) {
        offset = update.update_id + 1;
        const msg = update.message || update.edited_message;
        const sender = msg?.from?.username
          ? `@${msg.from.username} (${msg.from.id})`
          : `ID:${msg?.from?.id || "unknown"}`;
        const text = msg?.text || msg?.caption || "[Bukan Teks]";

        console.log(`📩 [${new Date().toLocaleTimeString()}] Pesan dari ${sender}: "${text}"`);

        // Teruskan update ke endpoint webhook lokal
        try {
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };
          if (secretToken) {
            headers["x-telegram-bot-api-secret-token"] = secretToken;
          }

          const hookRes = await fetch(webhookUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(update),
          });

          const hookResult = await hookRes.json();
          if (hookRes.ok) {
            console.log(`   ↳ ✅ Berhasil diproses (Status ${hookRes.status})`);
          } else {
            console.warn(`   ↳ ⚠️ Gagal diproses:`, hookResult);
          }
        } catch (forwardErr: any) {
          console.error(
            `   ↳ ❌ Gagal meneruskan ke webhook lokal (${webhookUrl}): ${forwardErr.message}`
          );
          console.error(
            `      Pastikan server aplikasi berjalan (misal: "pnpm dev") di port 3001!`
          );
        }
      }
    } catch (loopErr: any) {
      if (isRunning) {
        console.error("❌ Kesalahan saat polling:", loopErr.message);
        await new Promise((r) => setTimeout(r, 4000));
      }
    }
  }
}

// Menangani graceful exit saat ditekan Ctrl+C
process.on("SIGINT", () => {
  console.log("\n🛑 Menghentikan polling bot Telegram...");
  isRunning = false;
  process.exit(0);
});

preparePolling().then(() => pollUpdates());
