import { JSX, createSignal, onMount, Show } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import { Modal } from "../ui/Modal";
import {
  initAdminAuth,
  setAdminAuth,
  clearAdminAuth,
  type AdminUser,
} from "~/lib/adminAuthStore";
import {
  LayoutDashboard,
  ClipboardList,
  CalendarDays,
  UtensilsCrossed,
  Printer,
  Settings,
  LogOut,
  ExternalLink,
  KeyRound,
  User,
  Menu,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-solid";

interface AdminLayoutProps {
  children: JSX.Element;
  title: string;
  adminName?: string;
}

export function AdminLayout(props: AdminLayoutProps) {
  const location = useLocation();

  const [currentUser, setCurrentUser] = createSignal<AdminUser | null>(initAdminAuth());
  const [isAuthenticated, setIsAuthenticated] = createSignal(false);
  const [authChecking, setAuthChecking] = createSignal(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = createSignal(false);

  // Change Password Modal State
  const [isPasswordModalOpen, setIsPasswordModalOpen] = createSignal(false);
  const [oldPassword, setOldPassword] = createSignal("");
  const [newPassword, setNewPassword] = createSignal("");
  const [confirmPassword, setConfirmPassword] = createSignal("");
  const [passwordLoading, setPasswordLoading] = createSignal(false);
  const [passwordSuccess, setPasswordSuccess] = createSignal<string | null>(null);
  const [passwordError, setPasswordError] = createSignal<string | null>(null);

  const checkAuth = async () => {
    try {
      const res = await fetch("/api/admin/me", { credentials: "include" });
      const data = await res.json();
      if (!res.ok || !data.authenticated || !data.user) {
        clearAdminAuth();
        setIsAuthenticated(false);
        window.location.replace("/admin/login");
        return;
      }
      setCurrentUser(data.user);
      setAdminAuth(data.user);
      setIsAuthenticated(true);
    } catch (e) {
      clearAdminAuth();
      setIsAuthenticated(false);
      window.location.replace("/admin/login");
    } finally {
      setAuthChecking(false);
    }
  };

  onMount(() => {
    checkAuth();
  });

  const navItems = [
    { label: "Overview", href: "/admin", icon: LayoutDashboard },
    { label: "Pesanan Masuk", href: "/admin/orders", icon: ClipboardList },
    { label: "Gelombang Batch PO", href: "/admin/batches", icon: CalendarDays },
    { label: "Katalog Menu", href: "/admin/menu", icon: UtensilsCrossed },
    { label: "Rekap Produksi", href: "/admin/production", icon: Printer },
    { label: "Pengaturan Toko CMS", href: "/admin/settings", icon: Settings },
  ];

  const isActive = (href: string) => {
    if (href === "/admin") return location.pathname === "/admin";
    return location.pathname.startsWith(href);
  };

  const handleLogout = async () => {
    clearAdminAuth();
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch (e) {
      // Abaikan
    }
    window.location.href = "/admin/login";
  };

  const handleChangePassword = async (e: Event) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword().length < 6) {
      setPasswordError("Password baru minimal 6 karakter.");
      return;
    }

    if (newPassword() !== confirmPassword()) {
      setPasswordError("Konfirmasi password baru tidak cocok.");
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await fetch("/api/admin/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldPassword: oldPassword(),
          newPassword: newPassword(),
          confirmPassword: confirmPassword(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gagal mengubah password.");
      }

      setPasswordSuccess("Password berhasil diubah. Gunakan password baru saat login berikutnya.");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => {
        setIsPasswordModalOpen(false);
        setPasswordSuccess(null);
      }, 2500);
    } catch (err: any) {
      setPasswordError(err?.message || "Terjadi kesalahan saat mengubah password.");
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <Show
      when={isAuthenticated()}
      fallback={
        <div class="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center space-y-3">
          <Loader2 size={32} class="animate-spin text-[#6366F1]" />
          <span class="text-xs font-mono text-[#6B6B6B]">Memeriksa sesi admin...</span>
        </div>
      }
    >
      <div class="min-h-screen bg-[#F8F9FA] text-[#0A0A0A] flex flex-col">
        {/* Mobile Header Bar */}
      <div class="md:hidden bg-white border-b border-[#E8E8EC] h-16 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-[6px] bg-[#6366F1] flex items-center justify-center text-white shadow-xs font-bold text-base">
            M
          </div>
          <div class="flex flex-col">
            <span class="font-heading font-bold text-base leading-none text-[#0A0A0A]">
              Mol-Mol
            </span>
            <span class="text-[10px] uppercase font-mono tracking-wider text-[#6B6B6B]">
              Admin
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMobileSidebarOpen(!mobileSidebarOpen())}
          class="p-2 rounded-[6px] text-[#0A0A0A] hover:bg-black/5 transition cursor-pointer"
          aria-label="Toggle Menu Admin"
        >
          <Show when={mobileSidebarOpen()} fallback={<Menu size={20} />}>
            <X size={20} />
          </Show>
        </button>
      </div>

      {/* Main Layout Container */}
      <div class="flex-1 flex">
        {/* Desktop Fixed Sidebar */}
        <aside
          class={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-[#E8E8EC] flex flex-col justify-between transition-transform duration-200 md:translate-x-0 ${
            mobileSidebarOpen() ? "translate-x-0 shadow-2xl" : "-translate-x-full"
          }`}
        >
          <div class="flex flex-col h-full">
            {/* Sidebar Brand Header */}
            <div class="h-16 px-5 border-b border-[#E8E8EC] flex items-center justify-between shrink-0">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-[6px] bg-[#6366F1] flex items-center justify-center text-white font-bold text-sm shadow-2xs">
                  M
                </div>
                <div>
                  <span class="font-heading font-bold text-sm text-[#0A0A0A] leading-tight block">
                    Mol-Mol Admin
                  </span>
                  <span class="text-[10px] uppercase font-mono tracking-wider text-[#6B6B6B]">
                    Panel Administrasi
                  </span>
                </div>
              </div>

              <A
                href="/"
                target="_blank"
                class="text-[#9C9C9C] hover:text-[#6366F1] p-1.5 rounded-[6px] hover:bg-black/5 transition"
                title="Buka Website Publik"
              >
                <ExternalLink size={14} />
              </A>
            </div>

            {/* Navigation Menu */}
            <div class="flex-1 py-4 px-3 overflow-y-auto space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = () => isActive(item.href);
                return (
                  <A
                    href={item.href}
                    onClick={() => setMobileSidebarOpen(false)}
                    class={`flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-xs font-medium transition min-h-[40px] ${
                      active()
                        ? "bg-[#6366F1]/10 text-[#6366F1] font-semibold"
                        : "text-[#6B6B6B] hover:text-[#0A0A0A] hover:bg-[#F4F4F6]"
                    }`}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </A>
                );
              })}
            </div>

            {/* User Profile & Actions Footer */}
            <div class="p-3 border-t border-[#E8E8EC] bg-[#FAFAFA] space-y-2 shrink-0">
              <div class="px-2 py-1 flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-full bg-[#6366F1]/15 text-[#6366F1] flex items-center justify-center font-bold text-xs shrink-0">
                  <User size={15} />
                </div>
                <div class="truncate flex-1">
                  <span class="text-xs font-semibold text-[#0A0A0A] block truncate">
                    {currentUser()?.displayName || "Admin Toko"}
                  </span>
                  <span class="text-[10px] font-mono text-[#6B6B6B] block">
                    Role: {currentUser()?.role || "owner"}
                  </span>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-1 pt-1 border-t border-[#E8E8EC]">
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(true)}
                  class="btn-secondary btn-sm text-[11px] h-8 flex items-center justify-center gap-1 cursor-pointer w-full"
                  title="Ganti Password"
                >
                  <KeyRound size={12} />
                  <span>Ubah Sandi</span>
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  class="btn-destructive btn-sm text-[11px] h-8 flex items-center justify-center gap-1 cursor-pointer w-full"
                  title="Keluar"
                >
                  <LogOut size={12} />
                  <span>Keluar</span>
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Backdrop for mobile sidebar */}
        <Show when={mobileSidebarOpen()}>
          <div
            class="fixed inset-0 z-30 bg-black/40 md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          />
        </Show>

        {/* Content Wrapper (Offset by sidebar on desktop) */}
        <div class="flex-1 md:pl-64 flex flex-col min-w-0">
          {/* Top Bar for Desktop */}
          <header class="hidden md:flex h-16 bg-white border-b border-[#E8E8EC] px-6 sm:px-8 items-center sticky top-0 z-20">
            <div class="flex items-center gap-2 text-xs font-medium text-[#6B6B6B]">
              <span>Admin</span>
              <span>/</span>
              <span class="text-[#0A0A0A] font-semibold">{props.title}</span>
            </div>
          </header>

          {/* Page Body Container (Full fluid centered max-w-7xl) */}
          <main class="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
            <div class="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-[#E8E8EC]">
              <h1 class="font-heading font-bold text-xl sm:text-2xl lg:text-3xl text-[#0A0A0A]">
                {props.title}
              </h1>
            </div>

            {props.children}
          </main>
        </div>
      </div>

      {/* Change Password Modal */}
      <Modal
        isOpen={isPasswordModalOpen()}
        onClose={() => setIsPasswordModalOpen(false)}
        title="Ubah Password Admin"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleChangePassword} class="space-y-4 text-xs">
          <div>
            <label class="block font-semibold text-[#0A0A0A] mb-1">
              Password Saat Ini
            </label>
            <input
              type="password"
              required
              value={oldPassword()}
              onInput={(e) => setOldPassword(e.currentTarget.value)}
              placeholder="Masukkan password lama"
              class="input-base text-xs"
            />
          </div>

          <div>
            <label class="block font-semibold text-[#0A0A0A] mb-1">
              Password Baru (Minimal 6 karakter)
            </label>
            <input
              type="password"
              required
              value={newPassword()}
              onInput={(e) => setNewPassword(e.currentTarget.value)}
              placeholder="Masukkan password baru"
              class="input-base text-xs"
            />
          </div>

          <div>
            <label class="block font-semibold text-[#0A0A0A] mb-1">
              Konfirmasi Password Baru
            </label>
            <input
              type="password"
              required
              value={confirmPassword()}
              onInput={(e) => setConfirmPassword(e.currentTarget.value)}
              placeholder="Ulangi password baru"
              class="input-base text-xs"
            />
          </div>

          <Show when={passwordError()}>
            <div class="p-2.5 rounded-[6px] bg-[#FFF5F5] border border-[#FCA5A5] text-xs text-[#EF4444] flex items-center gap-1.5">
              <AlertCircle size={14} class="shrink-0" />
              <span>{passwordError()}</span>
            </div>
          </Show>

          <Show when={passwordSuccess()}>
            <div class="p-2.5 rounded-[6px] bg-[#F0FDF4] border border-[#BBF7D0] text-xs text-[#10B981] flex items-center gap-1.5">
              <CheckCircle2 size={14} class="shrink-0" />
              <span>{passwordSuccess()}</span>
            </div>
          </Show>

          <div class="flex items-center justify-end gap-2 pt-3 border-t border-[#E8E8EC]">
            <button
              type="button"
              onClick={() => setIsPasswordModalOpen(false)}
              disabled={passwordLoading()}
              class="btn-secondary btn-sm"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={passwordLoading()}
              class="btn-primary btn-sm flex items-center gap-1.5 cursor-pointer"
            >
              <Show when={passwordLoading()} fallback={<span>Simpan Password Baru</span>}>
                <Loader2 size={14} class="animate-spin" />
                <span>Menyimpan...</span>
              </Show>
            </button>
          </div>
        </form>
      </Modal>
    </div>
    </Show>
  );
}
