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
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Abaikan
    }
  }
}
