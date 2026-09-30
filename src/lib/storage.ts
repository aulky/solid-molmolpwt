import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
];

export const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

export interface SaveFileResult {
  filePath: string;
  relativePath: string;
  sizeBytes: number;
  mime: string;
}

/**
 * Memastikan direktori tujuan penyimpanan lokal tersedia
 */
export async function ensureDirectoryExists(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    // Ignore already exists
  }
}

/**
 * Simpan file gambar yang diunggah ke storage lokal secara aman
 */
export async function saveUploadedImage(
  buffer: Buffer,
  originalFilename: string,
  category: "proofs" | "menus" | "settings" = "proofs",
  mimeType = "image/jpeg"
): Promise<SaveFileResult> {
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error("Ukuran file melebihi batas maksimal 8 MB.");
  }

  // Sanitasi ekstensi
  let ext = path.extname(originalFilename).toLowerCase();
  if (!ext || ext === ".") {
    ext = mimeType.includes("png") ? ".png" : mimeType.includes("webp") ? ".webp" : ".jpg";
  }

  // Nama file acak dan unik
  const randomSuffix = crypto.randomBytes(12).toString("hex");
  const timestamp = Date.now();
  const safeFilename = `${category}-${timestamp}-${randomSuffix}${ext}`;

  // Simpan di direktori public/uploads/... agar dapat diakses oleh browser
  const uploadsDir = path.resolve(process.cwd(), "public", "uploads", category);
  await ensureDirectoryExists(uploadsDir);

  const fullFilePath = path.join(uploadsDir, safeFilename);
  const relativeWebPath = `/uploads/${category}/${safeFilename}`;

  // Coba proses dengan sharp jika tersedia, atau simpan buffer langsung
  try {
    // @ts-ignore
    const sharpModule = await import("sharp").catch(() => null);
    if (sharpModule && sharpModule.default) {
      const sharp = sharpModule.default;
      // Re-encode ke WebP, kompresi kualitas 85, strip EXIF privasi
      const webpFilename = `${category}-${timestamp}-${randomSuffix}.webp`;
      const webpFullPath = path.join(uploadsDir, webpFilename);
      const webpWebPath = `/uploads/${category}/${webpFilename}`;

      await sharp(buffer)
        .rotate() // auto rotate based on EXIF
        .webp({ quality: 85 })
        .toFile(webpFullPath);

      const stats = await fs.stat(webpFullPath);
      return {
        filePath: webpFullPath,
        relativePath: webpWebPath,
        sizeBytes: stats.size,
        mime: "image/webp",
      };
    }
  } catch (err) {
    // Sharp tidak tersedia atau gagal, fallback simpan buffer langsung
    console.warn("Sharp fallback to raw write:", err);
  }

  await fs.writeFile(fullFilePath, buffer);
  return {
    filePath: fullFilePath,
    relativePath: relativeWebPath,
    sizeBytes: buffer.length,
    mime: mimeType,
  };
}
