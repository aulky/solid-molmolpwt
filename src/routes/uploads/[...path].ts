import type { APIEvent } from "@solidjs/start/server";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
};

export async function GET(event: APIEvent) {
  try {
    const rawPath = event.params.path;
    if (!rawPath) {
      return new Response("Not Found", { status: 404 });
    }

    // Mencegah Directory Traversal (LFI / Path Traversal Attack)
    const normalized = path.normalize(rawPath).replace(/^(\.\.[\/\\])+/, "");
    if (normalized.includes("..") || normalized.includes("\0")) {
      return new Response("Forbidden", { status: 403 });
    }

    // Cari file di direktori public/uploads dan .output/public/uploads
    const candidates = [
      path.resolve(process.cwd(), "public", "uploads", normalized),
      path.resolve(process.cwd(), ".output", "public", "uploads", normalized),
    ];

    let targetFilePath = "";
    for (const candidate of candidates) {
      if (fsSync.existsSync(candidate)) {
        const stat = fsSync.statSync(candidate);
        if (stat.isFile()) {
          targetFilePath = candidate;
          break;
        }
      }
    }

    if (!targetFilePath) {
      return new Response("File Not Found", { status: 404 });
    }

    const ext = path.extname(targetFilePath).toLowerCase();
    const contentType = MIME_MAP[ext] || "application/octet-stream";

    const fileBuffer = await fs.readFile(targetFilePath);

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileBuffer.length),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err: any) {
    return new Response("Error loading file", { status: 500 });
  }
}
