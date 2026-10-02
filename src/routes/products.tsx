import { createSignal, For, Show } from "solid-js";
import { query, createAsync, A } from "@solidjs/router";
import { getAllMenuItems } from "~/lib/services/menu";
import { getStoreSettings, StoreSettingsData } from "~/lib/services/settings";
import { formatRupiah } from "~/lib/pricing";
import { Badge } from "~/components/ui/Badge";
import { Footer } from "~/components/Footer";
import {
  UtensilsCrossed,
  Package,
  ShoppingBag,
  ArrowRight,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Clock,
  ShieldCheck,
} from "lucide-solid";

// Data loader server function
const getProductsPageData = query(async () => {
  "use server";
  try {
    const [products, settings] = await Promise.all([
      getAllMenuItems(false),
      getStoreSettings(),
    ]);
    return { products, settings };
  } catch (err) {
    console.error("Products page data error:", err);
    return { products: [], settings: null };
  }
}, "productsPageData");

function ProductShowcaseCard(props: { product: any }) {
  const p = () => props.product;

  const images = () => {
    if (Array.isArray(p().images) && p().images.length > 0) return p().images;
    if (p().imagePath) return [p().imagePath];
    return [];
  };

  const [currentIdx, setCurrentIdx] = createSignal(0);

  const nextImg = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const imgs = images();
    if (imgs.length <= 1) return;
    setCurrentIdx((prev) => (prev + 1) % imgs.length);
  };

  const prevImg = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const imgs = images();
    if (imgs.length <= 1) return;
    setCurrentIdx((prev) => (prev - 1 + imgs.length) % imgs.length);
  };

  return (
    <div class="card-surface bg-white border border-[#E8E8EC] rounded-2xl overflow-hidden flex flex-col justify-between hover:border-[#6366F1]/50 hover:shadow-md transition group">
      {/* Gambar Carousel */}
      <div class="relative w-full aspect-4/3 bg-[#F4F4F6] overflow-hidden select-none">
        <Show
          when={images().length > 0}
          fallback={
            <div class="w-full h-full flex flex-col items-center justify-center text-[#9C9C9C] p-4 text-center">
              <UtensilsCrossed size={32} class="mb-2 text-[#6366F1]/50" />
              <span class="text-xs font-mono font-medium">Mol-Mol Purwokerto</span>
            </div>
          }
        >
          <img
            src={images()[currentIdx()]}
            alt={`${p().name} - Foto ${currentIdx() + 1}`}
            loading="lazy"
            decoding="async"
            class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-103"
          />

          <Show when={images().length > 1}>
            <button
              type="button"
              onClick={prevImg}
              class="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 hover:bg-white text-[#0A0A0A] shadow-xs flex items-center justify-center transition cursor-pointer"
              title="Foto Sebelumnya"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={nextImg}
              class="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 hover:bg-white text-[#0A0A0A] shadow-xs flex items-center justify-center transition cursor-pointer"
              title="Foto Berikutnya"
            >
              <ChevronRight size={14} />
            </button>

            {/* Dots Indicator */}
            <div class="absolute bottom-2 inset-x-0 flex justify-center gap-1.5">
              <For each={images()}>
                {(_, idx) => (
                  <span
                    class={`w-1.5 h-1.5 rounded-full transition-all ${
                      idx() === currentIdx() ? "bg-white w-3 shadow-xs" : "bg-white/60"
                    }`}
                  />
                )}
              </For>
            </div>
          </Show>
        </Show>

        {/* Featured Tag */}
        <Show when={p().isFeatured}>
          <div class="absolute top-2.5 left-2.5">
            <span class="bg-[#6366F1] text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-xs flex items-center gap-1">
              <Sparkles size={11} />
              <span>Favorit</span>
            </span>
          </div>
        </Show>
      </div>

      {/* Konten Detail Menu */}
      <div class="p-5 flex-1 flex flex-col justify-between space-y-4">
        <div class="space-y-2">
          <div class="flex items-start justify-between gap-2">
            <h3 class="font-heading font-bold text-base sm:text-lg text-[#0A0A0A] leading-snug">
              {p().name}
            </h3>
            <span class="text-[11px] font-mono text-[#6B6B6B] bg-[#FAFAFA] border border-[#E8E8EC] px-2 py-0.5 rounded shrink-0">
              {p().weightGrams ? `${p().weightGrams}g` : "1 Porsi"}
            </span>
          </div>

          <p class="text-xs sm:text-sm text-[#6B6B6B] leading-relaxed line-clamp-3">
            {p().description || "Camilan khas Mol-Mol Purwokerto dengan resep istimewa, dibuat higienis dan disajikan segar."}
          </p>
        </div>

        {/* Harga & Tombol Pesan */}
        <div class="pt-3 border-t border-[#E8E8EC] flex items-center justify-between gap-2">
          <div>
            <Show when={p().compareAtPrice && p().compareAtPrice > p().basePrice}>
              <span class="text-[11px] font-mono text-[#9C9C9C] line-through block">
                {formatRupiah(p().compareAtPrice)}
              </span>
            </Show>
            <span class="font-mono font-bold text-base sm:text-lg text-[#6366F1]">
              {formatRupiah(p().basePrice)}
            </span>
          </div>

          <A
            href="/"
            class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs font-semibold shadow-xs transition active:scale-[0.98]"
          >
            <span>Pesan PO</span>
            <ArrowRight size={13} />
          </A>
        </div>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const data = createAsync(() => getProductsPageData());

  const productList = () => data()?.products || [];
  const settings = () => data()?.settings as StoreSettingsData | null;

  const waUrl = () => {
    const phone = settings()?.adminPhone || "6281234567890";
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    return `https://wa.me/${cleanPhone}?text=Halo%20Admin%20Mol-Mol%20Purwokerto,%20saya%20tertarik%20dengan%20katalog%20produk%20Mol-Mol.%20Boleh%20tanya%20info%20lebih%20lanjut?`;
  };

  return (
    <div class="min-h-screen bg-[#FAFAFA] flex flex-col justify-between">
      <div class="max-w-6xl mx-auto px-4 py-8 sm:py-12 w-full space-y-8">
        {/* Header Hero Section */}
        <div class="text-center max-w-2xl mx-auto space-y-3">
          <h1 class="font-heading text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#0A0A0A] tracking-tight">
            Varian Rasa & Menu Khas Mol-Mol
          </h1>

          <p class="text-xs sm:text-sm text-[#6B6B6B] leading-relaxed font-body">
            Seluruh produk kami dibuat dari bahan-bahan pilihan berkualitas dengan resep otentik.
            Setiap porsi disiapkan segar sesuai jadwal gelombang Pre-Order untuk menjaga kerenyahan maksimal.
          </p>
        </div>

        {/* Grid Produk */}
        <Show
          when={productList().length > 0}
          fallback={
            <div class="card-surface p-12 bg-white border border-[#E8E8EC] rounded-2xl text-center space-y-4 max-w-md mx-auto">
              <div class="w-14 h-14 mx-auto rounded-2xl bg-[#6366F1]/10 flex items-center justify-center text-[#6366F1]">
                <Package size={28} />
              </div>
              <h3 class="font-heading text-lg font-bold text-[#0A0A0A]">
                Katalog Sedang Diperbarui
              </h3>
              <p class="text-xs text-[#6B6B6B]">
                Admin sedang memperbarui varian produk terbaru. Silakan pantau berkala atau hubungi WhatsApp kami.
              </p>
            </div>
          }
        >
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <For each={productList()}>
              {(product) => <ProductShowcaseCard product={product} />}
            </For>
          </div>
        </Show>

        {/* CTA Bawah: Jadwal Pre-Order & WhatsApp */}
        <div class="card-surface p-6 sm:p-8 bg-white border border-[#E8E8EC] rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xs">
          <div class="space-y-1.5 text-center sm:text-left">
            <h3 class="font-heading font-bold text-lg text-[#0A0A0A]">
              Ingin Menikmati Mol-Mol Purwokerto?
            </h3>
            <p class="text-xs sm:text-sm text-[#6B6B6B]">
              Pilih jadwal gelombang Pre-Order aktif untuk pengantaran langsung ke rumah Anda.
            </p>
          </div>

          <div class="flex items-center gap-3 w-full sm:w-auto">
            <A
              href="/"
              class="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs sm:text-sm font-semibold shadow-xs transition active:scale-[0.98]"
            >
              <ShoppingBag size={15} />
              <span>Lihat Jadwal PO</span>
            </A>

            <a
              href={waUrl()}
              target="_blank"
              rel="noopener noreferrer"
              class="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#E8E8EC] bg-white hover:bg-[#FAFAFA] text-[#0A0A0A] text-xs sm:text-sm font-semibold transition"
            >
              <MessageCircle size={15} class="text-[#20970B]" />
              <span>WhatsApp</span>
            </a>
          </div>
        </div>
      </div>

      {/* Footer Toko UMKM Identik dengan Landing Page */}
      <Footer adminPhone={settings()?.adminPhone} />
    </div>
  );
}
