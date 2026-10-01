import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, Plugin } from "vite";
import { nitro } from "nitro/vite";
import { solidStart } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Plugin untuk memantau performa dan durasi build,
 * memberikan notifikasi jika build memakan waktu terlalu lama (> 10s).
 */
function buildPerformanceNotifierPlugin(thresholdSeconds = 10): Plugin {
  let startTime = 0;
  return {
    name: "molmol-build-performance-notifier",
    apply: "build",
    buildStart() {
      if (!startTime) {
        startTime = Date.now();
        console.log(`\n\x1b[36m🚀 [Mol-Mol Build]\x1b[0m Memulai proses kompilasi & optimasi aplikasi...`);
      }
    },
    closeBundle() {
      if (!startTime) return;
      const elapsedSeconds = Number(((Date.now() - startTime) / 1000).toFixed(2));
      if (elapsedSeconds > thresholdSeconds) {
        console.warn(
          `\n\x1b[33m⚠️  [NOTIFIKASI PERFORMA BUILD]\x1b[0m Durasi build memakan waktu \x1b[31m${elapsedSeconds} detik\x1b[0m (melebihi batas rekomendasi ${thresholdSeconds}s).` +
          `\n💡 Rekomendasi: Aplikasi terasa berat. Kurangi ukuran asset/foto mentah, periksa import besar yang tidak terpakai, atau bersihkan cache .output.\n`
        );
      } else {
        console.log(
          `\x1b[32m⚡ [Mol-Mol Build Selesai]\x1b[0m Selesai dalam \x1b[32m${elapsedSeconds} detik\x1b[0m — Asset teroptimasi ringan & cepat.\n`
        );
      }
    },
  };
}

export default defineConfig({
  server: {
    port: 3001,
  },
  resolve: {
    alias: {
      "@jridgewell/resolve-uri": path.resolve(
        __dirname,
        "node_modules/@jridgewell/resolve-uri/dist/resolve-uri.mjs"
      ),
    },
  },
  build: {
    target: "esnext",
    minify: "esbuild",
    cssMinify: true,
    reportCompressedSize: false, // Mempercepat waktu build
    chunkSizeWarningLimit: 1000,
  },
  plugins: [
    buildPerformanceNotifierPlugin(10),
    solidStart(),
    tailwindcss(),
    nitro(),
  ],
});
