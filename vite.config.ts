import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import { solidStart } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  plugins: [
    solidStart(),
    tailwindcss(),
    nitro()
  ]
});
