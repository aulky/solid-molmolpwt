/**
 * Debug Mode Utility
 * Mengatur apakah detail error ditampilkan secara teknis atau disembunyikan
 * berdasarkan variabel DEBUG pada file .env (on / off / true / false).
 */

export function isDebugMode(): boolean {
  const envVal = (
    process.env.DEBUG ||
    (typeof process !== "undefined" && process.env ? process.env.DEBUG : "") ||
    ""
  ).trim().toLowerCase();

  return envVal === "on" || envVal === "true" || envVal === "1" || envVal === "yes";
}

/**
 * Format pesan error yang aman untuk respon API atau UI.
 * Jika debug mati (DEBUG=off), pesan teknis internal (seperti database / SQL / server trace)
 * digantikan dengan pesan umum yang ramah dan aman.
 */
export function formatSafeErrorMessage(
  err: any,
  fallbackMessage = "Terjadi kesalahan pada sistem. Silakan coba beberapa saat lagi."
): string {
  if (isDebugMode()) {
    return err?.stack || err?.message || String(err);
  }

  const rawMessage = err?.message || (typeof err === "string" ? err : "");

  // Deteksi pesan error internal / SQL / sistem yang tidak boleh bocor ke publik
  const sensitivePatterns = [
    /ER_/i,
    /ECONNREFUSED/i,
    /SELECT\s/i,
    /INSERT\s/i,
    /UPDATE\s/i,
    /DELETE\s/i,
    /FROM\s/i,
    /WHERE\s/i,
    /drizzle/i,
    /mysql/i,
    /password/i,
    /token/i,
    /secret/i,
    /syntax\serror/i,
    /table\s.*doesn't exist/i,
    /column\s.*cannot be null/i,
  ];

  for (const pattern of sensitivePatterns) {
    if (pattern.test(rawMessage)) {
      return fallbackMessage;
    }
  }

  return rawMessage || fallbackMessage;
}
