import { createSignal } from "solid-js";

export interface AdminUser {
  id: number;
  username: string;
  displayName: string;
  role: string;
}

const STORAGE_KEY = "molmol_admin_user";

// Shared reactive signal antar komponen admin
export const [currentAdmin, setCurrentAdmin] = createSignal<AdminUser | null>(null);

// Timestamp terakhir verifikasi sukses ke endpoint /api/admin/me
let lastVerifiedTimestamp = 0;
const REVERIFY_INTERVAL_MS = 60 * 1000; // 60 detik throttle agar tidak fetch berulang setiap klik menu

export function shouldReverifyAuth(): boolean {
  if (!currentAdmin()) return true;
  return Date.now() - lastVerifiedTimestamp > REVERIFY_INTERVAL_MS;
}

export function markAuthVerified() {
  lastVerifiedTimestamp = Date.now();
}

/**
 * Membaca data admin secara sinkron dari in-memory signal atau client storage.
 * Menghilangkan delay loading dan kedipan layar saat navigasi antar menu admin.
 */
export function initAdminAuth(): AdminUser | null {
  if (typeof window === "undefined") return null;

  // 1. Cek in-memory terlebih dahulu
  const memoryUser = currentAdmin();
  if (memoryUser) return memoryUser;

  // 2. Baca langsung dari storage
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AdminUser;
      if (parsed && typeof parsed.id === "number" && parsed.username) {
        setCurrentAdmin(parsed);
        return parsed;
      }
    }
  } catch {
    // Abaikan jika storage kosong atau rusak
  }

  return null;
}

/**
 * Menyimpan data admin yang berhasil login ke state & client storage
 */
export function setAdminAuth(user: AdminUser) {
  setCurrentAdmin(user);
  markAuthVerified();
  if (typeof window !== "undefined") {
    try {
      const serialized = JSON.stringify(user);
      sessionStorage.setItem(STORAGE_KEY, serialized);
      localStorage.setItem(STORAGE_KEY, serialized);
    } catch {
      // Abaikan jika storage kuota penuh / ditolak browser
    }
  }
}

/**
 * Membersihkan data admin saat logout
 */
export function clearAdminAuth() {
  setCurrentAdmin(null);
  lastVerifiedTimestamp = 0;
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Abaikan
    }
  }
}
