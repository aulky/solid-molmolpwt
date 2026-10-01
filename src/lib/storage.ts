import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
];

// Batas maksimal upload foto 4 MB di seluruh website
export const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024; // 4MB

// Daftar ekstensi terlarang (webshell, executable, script file)
const DANGEROUS_EXTENSIONS = [
  ".php", ".php3", ".php4", ".php5", ".phtml", ".phar", ".inc",
  ".asp", ".aspx", ".cer", ".asa",
  ".jsp", ".jspx",
  ".cgi", ".pl", ".py",
  ".sh", ".bash", ".bat", ".cmd", ".ps1", ".vbs", ".hta",
  ".exe", ".dll", ".so", ".jar",
  ".js", ".mjs", ".ts",
  ".html", ".htm", ".xhtml", ".shtml",
  ".svg", ".xml",
  ".htaccess", ".config", ".env", ".sql"
];

// Keyword webshell berbahaya yang tidak boleh ada dalam buffer file gambar
const DANGEROUS_CONTENT_PATTERNS = [
  /<\?php/i,
  /<\?=/i,
  /<script/i,
  /<svg/i,
  /eval\s*\(/i,
  /base64_decode\s*\(/i,
  /system\s*\(/i,
  /shell_exec\s*\(/i,
  /passthru\s*\(/i,
  /exec\s*\(/i,
  /popen\s*\(/i,
  /proc_open\s*\(/i,
];

export interface SaveFileResult {
  filePath: string;
  relativePath: string;
  sizeBytes: number;
  mime: string;
}

/**
 * Validasi signature header (magic bytes) untuk mencegah spoofing file ekstensi
 */
function validateImageMagicBytes(buffer: Buffer): "image/jpeg" | "image/png" | "image/webp" {
  if (buffer.length < 12) {
    throw new Error("File terlalu kecil atau rusak.");
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  // WebP: RIFF (bytes 0-3) dan WEBP (bytes 8-11)
  const riff = buffer.subarray(0, 4).toString("ascii");
  const webp = buffer.subarray(8, 12).toString("ascii");
  if (riff === "RIFF" && webp === "WEBP") {
    return "image/webp";
  }

  throw new Error("Format file tidak valid. Hanya file gambar asli (JPG, PNG, WebP) yang diizinkan.");
}

/**
 * Deteksi dan blokir potensi webshell atau script berbahaya di dalam file
 */
function inspectForWebshell(buffer: Buffer, originalFilename: string) {
  const lowerName = originalFilename.toLowerCase();

  // 1. Periksa ekstensi terlarang (termasuk double extension, contoh: test.php.jpg)
  const segments = lowerName.split(".");
  for (let i = 1; i < segments.length; i++) {
    const ext = `.${segments[i]}`;
    if (DANGEROUS_EXTENSIONS.includes(ext)) {
      throw new Error("File terdeteksi berbahaya dan ditolak oleh sistem keamanan (Dangerous Extension Detected).");
    }
  }

  // 2. Scan teks awal dan akhir buffer untuk pola webshell / PHP / script injection
  const sampleSize = Math.min(buffer.length, 32 * 1024);
  const sampleHead = buffer.subarray(0, sampleSize).toString("latin1");
  const sampleTail = buffer.subarray(Math.max(0, buffer.length - sampleSize)).toString("latin1");
  const fullSample = sampleHead + sampleTail;

  for (const pattern of DANGEROUS_CONTENT_PATTERNS) {
    if (pattern.test(fullSample)) {
      throw new Error("File terdeteksi mengandung kode/script berbahaya dan ditolak oleh sistem keamanan.");
    }
  }
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
  clientMimeType = "image/jpeg"
): Promise<SaveFileResult> {
  // 1. Validasi Ukuran Maksimal 4 MB
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error("Ukuran file melebihi batas maksimal 4 MB.");
  }

  // 2. Keamanan & Blacklist Webshell
  inspectForWebshell(buffer, originalFilename);

  // 3. Verifikasi signature magic bytes
  const verifiedMime = validateImageMagicBytes(buffer);

  // 4. Tentukan ekstensi aman berdasarkan signature asli
  let safeExt = ".jpg";
  if (verifiedMime === "image/png") safeExt = ".png";
  else if (verifiedMime === "image/webp") safeExt = ".webp";

  // 5. Nama file acak dan unik (menghapus nama asli untuk mencegah directory traversal atau null-byte attack)
  const randomSuffix = crypto.randomBytes(16).toString("hex");
  const timestamp = Date.now();
  const safeFilename = `${category}-${timestamp}-${randomSuffix}${safeExt}`;

  // 6. Simpan di direktori public/uploads/...
  const publicUploadsDir = path.resolve(process.cwd(), "public", "uploads", category);
  await ensureDirectoryExists(publicUploadsDir);
  const fullFilePath = path.join(publicUploadsDir, safeFilename);

  // Jika running dalam output build produksi (.output/public), simpan juga ke sana agar langsung tersedia
  const outputUploadsDir = path.resolve(process.cwd(), ".output", "public", "uploads", category);
  const hasOutputDir = fsSync.existsSync(path.resolve(process.cwd(), ".output", "public"));
  if (hasOutputDir) {
    await ensureDirectoryExists(outputUploadsDir);
  }

  // Tulis file utama ke public/uploads
  await fs.writeFile(fullFilePath, buffer);

  // Tulis salinan ke .output jika ada
  if (hasOutputDir) {
    const outputFilePath = path.join(outputUploadsDir, safeFilename);
    await fs.writeFile(outputFilePath, buffer).catch(() => {});
  }

  const relativeWebPath = `/uploads/${category}/${safeFilename}`;

  return {
    filePath: fullFilePath,
    relativePath: relativeWebPath,
    sizeBytes: buffer.length,
    mime: verifiedMime,
  };
}
