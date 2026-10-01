import * as dotenv from "dotenv";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const secretToken = process.env.TELEGRAM_SECRET_TOKEN;

if (!token) {
  console.error("❌ ERROR: TELEGRAM_BOT_TOKEN belum diset di .env");
  process.exit(1);
}

const arg = process.argv[2];

async function main() {
  if (!arg || arg === "--info") {
    console.log("🔍 Memeriksa status webhook Telegram terkini...");
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const data = await res.json();
    console.log("Hasil:", JSON.stringify(data, null, 2));
    return;
  }

  if (arg === "--delete" || arg === "--clear") {
    console.log("🗑️ Menghapus webhook Telegram...");
    const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`);
    const data = await res.json();
    console.log("Hasil:", JSON.stringify(data, null, 2));
    return;
  }

  // Set webhook ke URL yang diberikan
  const targetUrl = arg.trim();
  if (!targetUrl.startsWith("https://")) {
    console.error("❌ Webhook URL harus menggunakan protokol HTTPS!");
    process.exit(1);
  }

  console.log(`🌐 Mendaftarkan webhook ke: ${targetUrl}`);
  let apiUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(targetUrl)}`;
  if (secretToken) {
    apiUrl += `&secret_token=${encodeURIComponent(secretToken)}`;
  }

  const res = await fetch(apiUrl);
  const data = await res.json();
  console.log("Hasil registrasi webhook:", JSON.stringify(data, null, 2));
}

main().catch((err) => console.error("Error:", err));
