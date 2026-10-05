import { createSignal, onMount, Show } from "solid-js";
import {
  ShieldCheck,
  Lock,
  User,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Eye,
  EyeOff,
} from "lucide-solid";
import { initAdminAuth, setAdminAuth, clearAdminAuth } from "~/lib/adminAuthStore";

export default function AdminLoginPage() {
  const [username, setUsername] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [showPassword, setShowPassword] = createSignal(false);
  const [isLoading, setIsLoading] = createSignal(false);
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null);

  onMount(async () => {
    try {
      const res = await fetch("/api/admin/me", { credentials: "include" });
      const data = await res.json();
      if (res.ok && data.authenticated && data.user) {
        setAdminAuth(data.user);
        window.location.replace("/admin");
      } else {
        clearAdminAuth();
      }
    } catch (e) {
      clearAdminAuth();
    }
  });

  const handleLogin = async (e: Event) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    const form = e.currentTarget as HTMLFormElement;
    const userInput = (form.elements.namedItem("username") as HTMLInputElement)?.value;
    const passInput = (form.elements.namedItem("password") as HTMLInputElement)?.value;
    const cleanUsername = (userInput !== undefined && userInput !== "" ? userInput : username()).trim();
    const cleanPassword = passInput !== undefined && passInput !== "" ? passInput : password();

    if (!cleanUsername || !cleanPassword) {
      setErrorMsg("Username dan password wajib diisi.");
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: cleanUsername,
          password: cleanPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Username atau password salah.");
      }

      // Simpan langsung data admin agar dashboard terbaca instan tanpa lag
      if (data.user) {
        setAdminAuth(data.user);
      }

      // Redirect ke dashboard admin
      window.location.replace("/admin");
    } catch (err: any) {
      setErrorMsg(err?.message || "Terjadi kesalahan saat login");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div class="min-h-screen bg-[#FAF7F2] flex flex-col justify-center items-center px-3 sm:px-4 py-8 sm:py-12">
      <div class="w-full max-w-sm card-surface p-6 sm:p-8 bg-[#FFFDF9] border border-[#E8DFD5] rounded-2xl space-y-5 sm:space-y-6 shadow-xs">
        <div class="text-center space-y-2">
          <img
            src="/molmol-logo.jpg"
            alt="Logo Mol-Mol"
            class="w-16 h-16 rounded-full object-cover mx-auto border border-[#E8DFD5] shadow-xs"
          />
          <h1 class="font-heading font-bold text-xl sm:text-2xl text-[#1C1917]">
            Login Admin Mol-Mol
          </h1>
          <p class="text-xs text-[#6C5F57]">
            Masuk untuk mengelola pesanan, stok batch PO, dan operasional Mol-Mol Purwokerto.
          </p>
        </div>

        <form onSubmit={handleLogin} class="space-y-4">
          <div>
            <label for="username" class="block text-xs font-semibold text-[#1C1917] mb-1">
              Username Admin
            </label>
            <div class="relative">
              <input
                id="username"
                name="username"
                type="text"
                required
                autocomplete="username"
                value={username()}
                onInput={(e) => setUsername(e.currentTarget.value)}
                onChange={(e) => setUsername(e.currentTarget.value)}
                placeholder="Masukkan username"
                class="input-base text-xs"
                style={{ "padding-left": "2.5rem" }}
              />
              <User size={15} class="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E7F75] pointer-events-none" />
            </div>
          </div>

          <div>
            <label for="password" class="block text-xs font-semibold text-[#1C1917] mb-1">
              Password
            </label>
            <div class="relative">
              <input
                id="password"
                name="password"
                type={showPassword() ? "text" : "password"}
                required
                autocomplete="current-password"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                onChange={(e) => setPassword(e.currentTarget.value)}
                placeholder="Masukkan password"
                class="input-base text-xs"
                style={{ "padding-left": "2.5rem", "padding-right": "2.5rem" }}
              />
              <Lock size={15} class="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E7F75] pointer-events-none" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword())}
                class="absolute right-3 top-2.5 text-[#8E7F75] hover:text-[#1C1917] cursor-pointer"
                title={showPassword() ? "Sembunyikan password" : "Tampilkan password"}
              >
                <Show when={showPassword()} fallback={<Eye size={15} />}>
                  <EyeOff size={15} />
                </Show>
              </button>
            </div>
          </div>

          <Show when={errorMsg()}>
            <div class="p-2.5 rounded-xl bg-[#FFF5F5] border border-[#FECDD3] text-xs text-[#CE2738] flex items-center gap-1.5">
              <AlertCircle size={14} class="shrink-0" />
              <span>{errorMsg()}</span>
            </div>
          </Show>

          <button
            type="submit"
            disabled={isLoading()}
            class="btn-primary w-full flex items-center justify-center gap-2 h-11 cursor-pointer"
          >
            <Show when={isLoading()} fallback={<span>Masuk ke Dashboard</span>}>
              <Loader2 size={16} class="animate-spin" />
              <span>Memeriksa kredensial...</span>
            </Show>
          </button>
        </form>

        <div class="pt-4 border-t border-[#E8DFD5] text-center">
          <a href="/" class="text-xs text-[#CE2738] font-semibold hover:underline inline-flex items-center gap-1">
            <ArrowLeft size={13} />
            <span>Kembali ke Website Pre-Order</span>
          </a>
        </div>
      </div>
    </div>
  );
}
