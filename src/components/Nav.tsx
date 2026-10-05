import { createSignal, Show } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import { Package, Search, ShieldCheck, FileText, Menu, X, UtensilsCrossed } from "lucide-solid";

export default function Nav() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = createSignal(false);

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <header class="sticky top-0 z-40 w-full bg-[#FAF7F2]/95 backdrop-blur-md border-b border-[#E8DFD5] transition-all">
      <div class="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <A
          href="/"
          onClick={closeMenu}
          class="flex items-center gap-2.5 text-[#1C1917] font-semibold tracking-tight hover:opacity-90 transition"
        >
          <img
            src="/molmol-logo.jpg"
            alt="Mol-Mol Purwokerto Logo"
            class="w-10 h-10 rounded-full object-cover border border-[#E8DFD5] shadow-xs"
          />
          <div class="flex flex-col">
            <span class="font-heading font-bold text-lg leading-tight text-[#CE2738]">
              Mol-Mol
            </span>
            <span class="text-[10px] uppercase tracking-wider font-semibold text-[#8D7E73]">
              Purwokerto
            </span>
          </div>
        </A>

        {/* Desktop Navigation Links */}
        <nav class="hidden md:flex items-center gap-1.5">
          <A
            href="/"
            class={`px-3.5 py-2 rounded-full text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 ${
              isActive("/")
                ? "bg-[#CE2738] text-white shadow-xs"
                : "text-[#6C5F57] hover:text-[#1C1917] hover:bg-[#F3ECE2]"
            }`}
          >
            <Package size={15} />
            <span>Pre-Order</span>
          </A>

          <A
            href="/products"
            class={`px-3.5 py-2 rounded-full text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 ${
              isActive("/products")
                ? "bg-[#CE2738] text-white shadow-xs"
                : "text-[#6C5F57] hover:text-[#1C1917] hover:bg-[#F3ECE2]"
            }`}
          >
            <UtensilsCrossed size={15} />
            <span>Katalog Produk</span>
          </A>

          <A
            href="/track"
            class={`px-3.5 py-2 rounded-full text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 ${
              isActive("/track")
                ? "bg-[#CE2738] text-white shadow-xs"
                : "text-[#6C5F57] hover:text-[#1C1917] hover:bg-[#F3ECE2]"
            }`}
          >
            <Search size={15} />
            <span>Lacak Pesanan</span>
          </A>

          <A
            href="/terms"
            class={`px-3.5 py-2 rounded-full text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 ${
              isActive("/terms")
                ? "bg-[#CE2738] text-white shadow-xs"
                : "text-[#6C5F57] hover:text-[#1C1917] hover:bg-[#F3ECE2]"
            }`}
          >
            <FileText size={15} />
            <span>Ketentuan PO</span>
          </A>

          <A
            href="/admin"
            class={`px-3.5 py-2 rounded-full text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 ${
              isActive("/admin")
                ? "bg-[#CE2738] text-white shadow-xs"
                : "text-[#6C5F57] bg-[#FFFDF9] border border-[#E8DFD5] hover:text-[#1C1917] hover:border-[#CE2738]/40"
            }`}
          >
            <ShieldCheck size={15} />
            <span>Login</span>
          </A>
        </nav>

        {/* Mobile Hamburger Toggle */}
        <div class="flex items-center md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen())}
            class="p-2 rounded-xl text-[#1C1917] hover:bg-[#F3ECE2] transition cursor-pointer"
            aria-label="Toggle Navigation Menu"
          >
            <Show when={mobileMenuOpen()} fallback={<Menu size={22} />}>
              <X size={22} />
            </Show>
          </button>
        </div>
      </div>

      {/* Mobile Drawer Dropdown */}
      <Show when={mobileMenuOpen()}>
        <div class="md:hidden border-t border-[#E8DFD5] bg-[#FAF7F2] px-4 py-3 space-y-1.5 shadow-lg transition-all animate-in fade-in slide-in-from-top-2">
          <A
            href="/"
            onClick={closeMenu}
            class={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold min-h-[44px] ${
              isActive("/")
                ? "bg-[#CE2738] text-white shadow-xs"
                : "text-[#1C1917] hover:bg-[#F3ECE2]"
            }`}
          >
            <Package size={18} />
            <span>Katalog Pre-Order</span>
          </A>

          <A
            href="/products"
            onClick={closeMenu}
            class={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold min-h-[44px] ${
              isActive("/products")
                ? "bg-[#CE2738] text-white shadow-xs"
                : "text-[#1C1917] hover:bg-[#F3ECE2]"
            }`}
          >
            <UtensilsCrossed size={18} />
            <span>Katalog Produk</span>
          </A>

          <A
            href="/track"
            onClick={closeMenu}
            class={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold min-h-[44px] ${
              isActive("/track")
                ? "bg-[#CE2738] text-white shadow-xs"
                : "text-[#1C1917] hover:bg-[#F3ECE2]"
            }`}
          >
            <Search size={18} />
            <span>Lacak Status Pesanan</span>
          </A>

          <A
            href="/terms"
            onClick={closeMenu}
            class={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold min-h-[44px] ${
              isActive("/terms")
                ? "bg-[#CE2738] text-white shadow-xs"
                : "text-[#1C1917] hover:bg-[#F3ECE2]"
            }`}
          >
            <FileText size={18} />
            <span>Syarat & Ketentuan PO</span>
          </A>

          <div class="pt-2 border-t border-[#E8DFD5] mt-2">
            <A
              href="/admin"
              onClick={closeMenu}
              class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-[#CE2738] bg-[#FFFDF9] border border-[#E8DFD5] hover:bg-[#F3ECE2] min-h-[44px]"
            >
              <ShieldCheck size={18} />
              <span>Login Admin</span>
            </A>
          </div>
        </div>
      </Show>
    </header>
  );
}
