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
    <header class="sticky top-0 z-40 w-full bg-[#FFFFFF]/95 backdrop-blur-md border-b border-[#E8E8EC] transition-all">
      <div class="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Brand Logo */}
        <A
          href="/"
          onClick={closeMenu}
          class="flex items-center gap-2.5 text-[#0A0A0A] font-semibold tracking-tight hover:opacity-90 transition"
        >
          <div class="w-8 h-8 rounded-[6px] bg-[#6366F1] flex items-center justify-center text-white shadow-xs font-bold text-base">
            M
          </div>
          <div class="flex flex-col">
            <span class="font-heading font-bold text-base leading-none text-[#0A0A0A]">
              Mol-Mol
            </span>
            <span class="text-[10px] uppercase font-mono tracking-wider text-[#6B6B6B]">
              Purwokerto
            </span>
          </div>
        </A>

        {/* Desktop Navigation Links */}
        <nav class="hidden md:flex items-center gap-2">
          <A
            href="/"
            class={`px-3 py-1.5 rounded-[6px] text-xs sm:text-sm font-medium transition flex items-center gap-1.5 ${
              isActive("/")
                ? "bg-[#6366F1]/10 text-[#6366F1]"
                : "text-[#6B6B6B] hover:text-[#0A0A0A] hover:bg-black/5"
            }`}
          >
            <Package size={15} />
            <span>Pre-Order</span>
          </A>

          <A
            href="/products"
            class={`px-3 py-1.5 rounded-[6px] text-xs sm:text-sm font-medium transition flex items-center gap-1.5 ${
              isActive("/products")
                ? "bg-[#6366F1]/10 text-[#6366F1]"
                : "text-[#6B6B6B] hover:text-[#0A0A0A] hover:bg-black/5"
            }`}
          >
            <UtensilsCrossed size={15} />
            <span>Katalog Produk</span>
          </A>

          <A
            href="/track"
            class={`px-3 py-1.5 rounded-[6px] text-xs sm:text-sm font-medium transition flex items-center gap-1.5 ${
              isActive("/track")
                ? "bg-[#6366F1]/10 text-[#6366F1]"
                : "text-[#6B6B6B] hover:text-[#0A0A0A] hover:bg-black/5"
            }`}
          >
            <Search size={15} />
            <span>Lacak Pesanan</span>
          </A>

          <A
            href="/terms"
            class={`px-3 py-1.5 rounded-[6px] text-xs sm:text-sm font-medium transition flex items-center gap-1.5 ${
              isActive("/terms")
                ? "bg-[#6366F1]/10 text-[#6366F1]"
                : "text-[#6B6B6B] hover:text-[#0A0A0A] hover:bg-black/5"
            }`}
          >
            <FileText size={15} />
            <span>Ketentuan PO</span>
          </A>

          <A
            href="/admin"
            class={`px-3 py-1.5 rounded-[6px] text-xs sm:text-sm font-medium transition flex items-center gap-1.5 ${
              isActive("/admin")
                ? "bg-[#6366F1]/10 text-[#6366F1]"
                : "text-[#6B6B6B] hover:text-[#0A0A0A] hover:bg-black/5"
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
            class="p-2 rounded-[6px] text-[#0A0A0A] hover:bg-black/5 transition cursor-pointer"
            aria-label="Toggle Navigation Menu"
          >
            <Show when={mobileMenuOpen()} fallback={<Menu size={20} />}>
              <X size={20} />
            </Show>
          </button>
        </div>
      </div>

      {/* Mobile Drawer Dropdown */}
      <Show when={mobileMenuOpen()}>
        <div class="md:hidden border-t border-[#E8E8EC] bg-white px-4 py-3 space-y-1 shadow-lg transition-all animate-in fade-in slide-in-from-top-2">
          <A
            href="/"
            onClick={closeMenu}
            class={`flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-sm font-medium min-h-[44px] ${
              isActive("/")
                ? "bg-[#6366F1]/10 text-[#6366F1] font-semibold"
                : "text-[#0A0A0A] hover:bg-[#FAFAFA]"
            }`}
          >
            <Package size={18} class="text-[#6366F1]" />
            <span>Katalog Pre-Order</span>
          </A>

          <A
            href="/products"
            onClick={closeMenu}
            class={`flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-sm font-medium min-h-[44px] ${
              isActive("/products")
                ? "bg-[#6366F1]/10 text-[#6366F1] font-semibold"
                : "text-[#0A0A0A] hover:bg-[#FAFAFA]"
            }`}
          >
            <UtensilsCrossed size={18} class="text-[#6366F1]" />
            <span>Katalog Produk</span>
          </A>

          <A
            href="/track"
            onClick={closeMenu}
            class={`flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-sm font-medium min-h-[44px] ${
              isActive("/track")
                ? "bg-[#6366F1]/10 text-[#6366F1] font-semibold"
                : "text-[#0A0A0A] hover:bg-[#FAFAFA]"
            }`}
          >
            <Search size={18} class="text-[#6366F1]" />
            <span>Lacak Status Pesanan</span>
          </A>

          <A
            href="/terms"
            onClick={closeMenu}
            class={`flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-sm font-medium min-h-[44px] ${
              isActive("/terms")
                ? "bg-[#6366F1]/10 text-[#6366F1] font-semibold"
                : "text-[#0A0A0A] hover:bg-[#FAFAFA]"
            }`}
          >
            <FileText size={18} class="text-[#6366F1]" />
            <span>Syarat & Ketentuan PO</span>
          </A>

          <div class="pt-2 border-t border-[#E8E8EC] mt-2">
            <A
              href="/admin"
              onClick={closeMenu}
              class="flex items-center gap-3 px-3 py-2.5 rounded-[6px] text-sm font-semibold text-[#6366F1] bg-[#6366F1]/5 hover:bg-[#6366F1]/10 min-h-[44px]"
            >
              <ShieldCheck size={18} />
              <span>Login</span>
            </A>
          </div>
        </div>
      </Show>
    </header>
  );
}
