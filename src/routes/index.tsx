import { createSignal, createMemo, onMount, For, Show } from "solid-js";
import { query, createAsync } from "@solidjs/router";
import { getAllActiveBatches, getActiveBatch } from "~/lib/services/batch";
import { getStoreSettings, StoreSettingsData } from "~/lib/services/settings";
import { BatchHero, BatchInfo } from "~/components/catalog/BatchHero";
import { ProductCard, CatalogProduct } from "~/components/catalog/ProductCard";
import { CheckoutModal } from "~/components/checkout/CheckoutModal";
import { formatRupiah, formatTanggalWIB } from "~/lib/pricing";
import {
  ShoppingBag,
  ArrowRight,
  MapPin,
  Phone,
  ShieldCheck,
  CalendarX,
  Sparkles,
  MessageCircle,
  Search,
  Clock,
} from "lucide-solid";

// Data loader server function
const getHomePageData = query(async () => {
  "use server";
  try {
    const [batches, settings] = await Promise.all([
      getAllActiveBatches(),
      getStoreSettings(),
    ]);
    return {
      batches,
      batch: batches[0] || null,
      settings,
    };
  } catch (err) {
    console.error("Home page data load error:", err);
    return { batches: [], batch: null, settings: null };
  }
}, "homePageData");

function NoActiveBatchView(props: {
  settings: StoreSettingsData;
  announcement?: string | null;
}) {
  const waUrl = () => {
    const phone = props.settings.adminPhone || "6281234567890";
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    return `https://wa.me/${cleanPhone}?text=Halo%20Admin%20Mol-Mol%20Purwokerto,%20saya%20ingin%20tanya%20kapan%20jadwal%20Pre-Order%20berikutnya%20dibuka?`;
  };

  return (
    <div class="space-y-6 max-w-3xl mx-auto py-6 sm:py-10">
      {/* Pengumuman Toko jika aktif */}
      <Show when={props.announcement}>
        <div class="bg-gradient-to-r from-[#6366F1]/10 via-[#20970B]/10 to-[#6366F1]/10 border border-[#6366F1]/20 rounded-xl p-3 px-4 flex items-center gap-2.5 text-xs sm:text-sm text-[#0A0A0A]">
          <Sparkles size={16} class="text-[#6366F1] shrink-0" />
          <span class="font-medium">{props.announcement}</span>
        </div>
      </Show>

      {/* Main Empty State Card */}
      <div class="card-surface p-8 sm:p-12 bg-white border border-[#E8E8EC] rounded-2xl text-center space-y-6 shadow-xs">
        <div class="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-3xl bg-[#6366F1]/10 border border-[#6366F1]/20 flex items-center justify-center text-[#6366F1]">
          <CalendarX size={36} strokeWidth={1.75} />
        </div>

        <div class="space-y-2">
          <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-700 text-xs font-semibold">
            <span>Pre-Order Sedang Ditutup</span>
          </div>

          <h1 class="font-heading text-2xl sm:text-3xl lg:text-4xl font-bold text-[#0A0A0A] tracking-tight">
            Belum Ada Gelombang Pre-Order yang Dibuka
          </h1>

          <p class="text-sm text-[#6B6B6B] leading-relaxed max-w-lg mx-auto font-body">
            Saat ini dapur <strong>Mol-Mol Purwokerto</strong> belum membuka gelombang pemesanan baru. Kami membuka pre-order secara berkala demi menjaga kesegaran dan kerenyahan camilan khas kami.
          </p>
        </div>

        <div class="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <a
            href={waUrl()}
            target="_blank"
            rel="noopener noreferrer"
            class="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#20970B] hover:bg-[#197B08] text-white text-sm font-semibold shadow-xs transition active:scale-[0.98]"
          >
            <MessageCircle size={17} />
            <span>Tanya Jadwal PO via WhatsApp</span>
          </a>

          <a
            href="/track"
            class="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#F4F4F5] hover:bg-[#E4E4E7] text-[#0A0A0A] text-sm font-medium transition active:scale-[0.98]"
          >
            <Search size={16} />
            <span>Lacak Pesanan Sebelumnya</span>
          </a>
        </div>

        {/* Info Tambahan */}
        <div class="pt-6 border-t border-[#E8E8EC] grid grid-cols-1 sm:grid-cols-2 gap-3 text-left text-xs text-[#6B6B6B]">
          <div class="p-3 rounded-lg bg-[#FAFAFA] border border-[#E8E8EC]/80 flex items-start gap-2.5">
            <Clock size={16} class="text-[#6366F1] shrink-0 mt-0.5" />
            <div>
              <span class="font-semibold text-[#0A0A0A] block">Jam Dapur & Admin</span>
              <span>
                {props.settings.operationalHours?.open || "08:00"} -{" "}
                {props.settings.operationalHours?.close || "20:00"} WIB (
                {props.settings.operationalHours?.days || "Setiap Hari"})
              </span>
            </div>
          </div>

          <div class="p-3 rounded-lg bg-[#FAFAFA] border border-[#E8E8EC]/80 flex items-start gap-2.5">
            <MapPin size={16} class="text-[#6366F1] shrink-0 mt-0.5" />
            <div>
              <span class="font-semibold text-[#0A0A0A] block">Wilayah Pengantaran</span>
              <span>Purwokerto, Banyumas & sekitarnya</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const data = createAsync(() => getHomePageData());

  // State Keranjang Belanja: Map(batchItemId -> qty)
  const [cartMap, setCartMap] = createSignal<Record<number, number>>({});
  const [isCheckoutOpen, setIsCheckoutOpen] = createSignal(false);

  // Load keranjang dari localStorage saat mount
  onMount(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("molmol_cart");
        if (saved) {
          setCartMap(JSON.parse(saved));
        }
      } catch (e) {
        // ignore
      }
    }
  });

  const updateCartQty = (batchItemId: number, qty: number) => {
    setCartMap((prev) => {
      const next = { ...prev };
      if (qty <= 0) {
        delete next[batchItemId];
      } else {
        next[batchItemId] = qty;
      }

      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("molmol_cart", JSON.stringify(next));
        } catch (e) {}
      }
      return next;
    });
  };

  const clearCart = () => {
    setCartMap({});
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("molmol_cart");
      } catch (e) {}
    }
  };

  const [selectedBatchId, setSelectedBatchId] = createSignal<number | null>(null);

  const activeBatches = createMemo((): any[] => {
    const d = data();
    if (d?.batches && d.batches.length > 0) return d.batches as any[];
    if (d?.batch) return [d.batch] as any[];
    return [];
  });

  // Ambil batch aktif dari database secara dinamis (null jika tidak ada batch terbuka)
  const currentBatch = createMemo((): BatchInfo | null => {
    const list = activeBatches();
    if (list.length > 0) {
      const selId = selectedBatchId();
      if (selId) {
        const found = list.find((b: any) => b.id === selId);
        if (found) return found as BatchInfo;
      }
      return list[0] as BatchInfo;
    }
    return null;
  });

  // Ambil daftar produk aktif yang terhubung dengan batch (kosong jika tidak ada)
  const productList = createMemo((): CatalogProduct[] => {
    const b = currentBatch() as any;
    if (b && b.items && Array.isArray(b.items)) {
      return b.items as CatalogProduct[];
    }
    return [];
  });

  const storeSettings = createMemo((): StoreSettingsData => {
    return (
      data()?.settings || {
        id: 1,
        storeName: "Mol-Mol Purwokerto",
        storeTagline: "Camilan Tradisional Manis & Gurih Khas Purwokerto — Sistem Pre-Order Berkala",
        logoPath: null,
        qrisImagePath: null,
        bankName: "BCA",
        bankAccountNo: "0461234567",
        bankAccountName: "Mol-Mol Purwokerto",
        allowDelivery: true,
        allowCod: true,
        flatDeliveryFee: 10000,
        freeDeliveryMin: 75000,
        announcementText: "Pre-Order Batch Oktober telah dibuka! Kuota terbatas 50 slot pesanan.",
        announcementActive: true,
        adminPhone: "6281234567890",
        adminTelegramChatId: null,
        operationalHours: { open: "08:00", close: "20:00", days: "Setiap Hari" },
        mapsEmbedUrl: null,
        trackRequirePhone: false,
      }
    );
  });

  // Hitung total item & total belanja di keranjang
  const cartSummary = createMemo(() => {
    const map = cartMap();
    let totalItems = 0;
    let subtotal = 0;
    const itemsList: Array<{ product: CatalogProduct; qty: number }> = [];

    const products = productList();
    for (const p of products) {
      const q = map[p.batchItemId] || 0;
      if (q > 0) {
        totalItems += q;
        subtotal += p.effectivePrice * q;
        itemsList.push({ product: p, qty: q });
      }
    }

    return { totalItems, subtotal, itemsList };
  });

  return (
    <div class="min-h-screen bg-[#FAFAFA] flex flex-col justify-between">
      {/* Container Konten Utama */}
      <div class="max-w-6xl mx-auto px-4 py-6 sm:py-8 w-full space-y-8 pb-28">
        <Show
          when={currentBatch()}
          fallback={
            <NoActiveBatchView
              settings={storeSettings()}
              announcement={
                storeSettings().announcementActive ? storeSettings().announcementText : null
              }
            />
          }
        >
          {/* Multi-Batch Switcher if multiple active batches exist */}
          <Show when={activeBatches().length > 1}>
            <div class="card-surface p-4 bg-white border border-[#E8E8EC] rounded-xl space-y-3">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
                    Tersedia {activeBatches().length} Gelombang Pre-Order
                  </span>
                </div>
                <span class="text-[11px] text-[#6B6B6B]">
                  Klik gelombang PO di bawah untuk melihat jadwal, kuota & menu:
                </span>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                <For each={activeBatches()}>
                  {(b: any) => {
                    const isSelected = () => currentBatch()?.id === b.id;
                    const remaining = Math.max(0, b.quotaTotal - b.quotaUsed);
                    return (
                      <button
                        type="button"
                        onClick={() => setSelectedBatchId(b.id)}
                        class={`p-3 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                          isSelected()
                            ? "bg-[#6366F1]/5 border-[#6366F1] shadow-xs ring-1 ring-[#6366F1]/30"
                            : "bg-[#FAFAFA] border-[#E8E8EC] hover:border-[#6366F1]/40 hover:bg-white"
                        }`}
                      >
                        <div class="flex items-center justify-between gap-2">
                          <span
                            class={`font-mono text-xs font-bold ${
                              isSelected() ? "text-[#6366F1]" : "text-[#0A0A0A]"
                            }`}
                          >
                            {b.code}
                          </span>
                          <Show
                            when={isSelected()}
                            fallback={
                              <span class="text-[10px] text-[#6B6B6B] bg-[#E8E8EC]/60 px-1.5 py-0.5 rounded font-mono">
                                Lihat PO
                              </span>
                            }
                          >
                            <span class="text-[10px] bg-[#6366F1] text-white px-2 py-0.5 rounded font-semibold">
                              Dipilih
                            </span>
                          </Show>
                        </div>

                        <h4 class="font-heading font-semibold text-xs text-[#0A0A0A] line-clamp-1">
                          {b.title}
                        </h4>

                        <div class="flex items-center justify-between text-[11px] text-[#6B6B6B] pt-1.5 border-t border-[#E8E8EC]/80">
                          <span>Kirim: {formatTanggalWIB(b.deliveryDate, { includeTime: false })}</span>
                          <span class="font-mono font-medium text-[#6366F1]">Sisa {remaining} slot</span>
                        </div>
                      </button>
                    );
                  }}
                </For>
              </div>
            </div>
          </Show>

          {/* Banner Hero Batch PO */}
          <BatchHero
            batch={currentBatch()}
            announcement={
              storeSettings().announcementActive ? storeSettings().announcementText : null
            }
          />

          {/* Section Heading Katalog */}
          <div class="flex flex-wrap items-baseline justify-between gap-2 pt-4">
            <div>
              <span class="text-xs font-mono uppercase text-[#6B6B6B] tracking-wider block">
                Menu Pilihan • {currentBatch()?.code}
              </span>
              <h2 class="font-heading text-xl sm:text-2xl font-bold text-[#0A0A0A]">
                Katalog Pre-Order
              </h2>
            </div>

            <div class="text-xs text-[#6B6B6B]">
              Pilih varian rasa favorit Anda untuk {currentBatch()?.title}
            </div>
          </div>

          {/* Grid Kartu Produk atau Tampilan Menu Kosong */}
          <Show
            when={productList().length > 0}
            fallback={
              <div class="card-surface p-10 sm:p-14 bg-white border border-[#E8E8EC] rounded-2xl text-center space-y-3">
                <div class="w-14 h-14 mx-auto rounded-2xl bg-[#6366F1]/10 flex items-center justify-center text-[#6366F1]">
                  <ShoppingBag size={28} />
                </div>
                <h3 class="font-heading text-lg font-bold text-[#0A0A0A]">
                  Menu Sedang Disiapkan
                </h3>
                <p class="text-xs sm:text-sm text-[#6B6B6B] max-w-md mx-auto">
                  Belum ada menu yang diaktifkan untuk gelombang pre-order ini. Silakan pantau berkala atau hubungi admin.
                </p>
              </div>
            }
          >
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              <For each={productList()}>
                {(product) => (
                  <ProductCard
                    product={product}
                    cartQty={cartMap()[product.batchItemId] || 0}
                    onUpdateQty={(q) => updateCartQty(product.batchItemId, q)}
                  />
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>

      {/* Floating / Sticky Mobile Cart Bar (Section 8.2 PLAN.md) */}
      <Show when={cartSummary().totalItems > 0}>
        <aside aria-label="Ringkasan Keranjang Belanja" class="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E8E8EC] p-3 sm:p-4 shadow-xl">
          <div class="max-w-6xl mx-auto flex items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-[#6366F1]/10 text-[#6366F1] flex items-center justify-center font-bold text-sm shrink-0">
                <ShoppingBag size={20} />
              </div>
              <div>
                <span class="text-xs font-mono text-[#6B6B6B] block">
                  {cartSummary().totalItems} porsi dipilih
                </span>
                <span class="font-heading font-bold text-base sm:text-lg text-[#0A0A0A]">
                  {formatRupiah(cartSummary().subtotal)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsCheckoutOpen(true)}
              class="btn-primary flex items-center justify-center gap-1.5 px-3.5 sm:px-5 h-10 sm:h-11 text-xs sm:text-sm font-semibold cursor-pointer shadow-md shrink-0"
            >
              <span>Checkout</span>
              <span class="hidden sm:inline">Pesanan</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </aside>
      </Show>

      {/* Modal Dialog Checkout */}
      <Show when={currentBatch()}>
        {(batch) => (
          <CheckoutModal
            isOpen={isCheckoutOpen()}
            onClose={() => setIsCheckoutOpen(false)}
            batch={batch()}
            cartItems={cartSummary().itemsList}
            storeSettings={storeSettings()}
            onSuccess={() => clearCart()}
          />
        )}
      </Show>

      {/* Footer Toko UMKM */}
      <footer class="bg-white border-t border-[#E8E8EC] py-10 mt-12 text-[#6B6B6B] text-xs">
        <div class="max-w-6xl mx-auto px-4 grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div class="space-y-2">
            <h5 class="font-heading font-bold text-sm text-[#0A0A0A]">
              Mol-Mol Purwokerto
            </h5>
            <p class="leading-relaxed">
              Dessert & Cemilan Purwokerto manis dan gurih dengan resep otentik, higienis, dan cita rasa premium.
            </p>
            {/* Social Media Links (Instagram, Threads, TikTok) */}
            <div class="pt-1 flex items-center gap-2">
              <a
                href="https://www.instagram.com/molmol.purwokerto/"
                target="_blank"
                rel="noopener noreferrer"
                class="w-8 h-8 rounded-full bg-[#FAFAFA] border border-[#E8E8EC] flex items-center justify-center text-[#E1306C] hover:bg-[#E1306C] hover:text-white hover:border-[#E1306C] transition shadow-2xs cursor-pointer"
                title="Instagram @molmol.purwokerto"
                aria-label="Instagram @molmol.purwokerto"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
              </a>

              <a
                href="https://www.threads.com/@molmol.purwokerto"
                target="_blank"
                rel="noopener noreferrer"
                class="w-8 h-8 rounded-full bg-[#FAFAFA] border border-[#E8E8EC] flex items-center justify-center text-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-white hover:border-[#0A0A0A] transition shadow-2xs cursor-pointer"
                title="Threads @molmol.purwokerto"
                aria-label="Threads @molmol.purwokerto"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M18.263 11.097c-.03-3.486-1.92-5.586-5.111-5.586-2.13 0-3.922.963-4.863 2.499l2.062 1.438c.535-.843 1.272-1.543 2.628-1.543 1.528 0 2.318.85 2.544 2.431a15 15 0 0 0-2.236-.173c-4.125 0-6.068 1.867-6.068 4.336s1.943 3.99 4.804 3.99c3.139 0 5.013-2.115 5.781-4.735.798.361 1.348 1.204 1.348 2.47 0 3.387-3.907 5.232-7.22 5.232-4.885 0-8.077-3.207-8.077-8.424 0-6.392 4.223-10.487 9.9-10.487 3.808 0 5.69 1.671 6.97 3.914l2.108-1.475C21.44 2.078 18.331 0 13.663 0 6.227 0 1.168 5.277 1.168 12.934c0 7 4.953 11.066 10.856 11.066 4.878 0 9.809-2.846 9.809-7.716 0-2.545-1.46-4.231-3.569-5.187m-6.33 4.855c-1.077 0-2.026-.512-2.026-1.453 0-1.483 1.822-1.934 3.606-1.934.678 0 1.34.045 1.927.173-.422 1.927-1.671 3.215-3.508 3.214Z" />
                </svg>
              </a>

              <a
                href="https://www.tiktok.com/@molmol.purwokerto"
                target="_blank"
                rel="noopener noreferrer"
                class="w-8 h-8 rounded-full bg-[#FAFAFA] border border-[#E8E8EC] flex items-center justify-center text-[#0A0A0A] hover:bg-[#000000] hover:text-[#00F2FE] hover:border-[#000000] transition shadow-2xs cursor-pointer"
                title="TikTok @molmol.purwokerto"
                aria-label="TikTok @molmol.purwokerto"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
                </svg>
              </a>
            </div>
          </div>

          <div class="space-y-2">
            <h5 class="font-heading font-bold text-sm text-[#0A0A0A]">
              Layanan & Operasional
            </h5>
            <div class="space-y-1">
              <div class="flex items-center gap-1.5">
                <MapPin size={13} class="text-[#6366F1]" />
                <span>Purwokerto, Jawa Tengah</span>
              </div>
              <div class="flex items-center gap-1.5">
                <Phone size={13} class="text-[#6366F1]" />
                <span>WhatsApp: {storeSettings().adminPhone}</span>
              </div>
            </div>
          </div>

          <div class="space-y-2">
            <h5 class="font-heading font-bold text-sm text-[#0A0A0A]">
              Ketentuan Pre-Order
            </h5>
            <p class="leading-relaxed">
              Pesanan diproduksi segar sesuai kuota gelombang PO. Bukti pembayaran wajib diunggah untuk konfirmasi jadwal pengantaran.
            </p>
          </div>
        </div>

        <div class="max-w-6xl mx-auto px-4 mt-8 pt-4 border-t border-[#E8E8EC] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#9C9C9C]">
          <div class="flex items-center gap-3">
            <span>© 2026 Mol-Mol Purwokerto. Semua hak cipta dilindungi.</span>
            <span>•</span>
            <a href="/terms" class="hover:text-[#6366F1] underline">Syarat & Kebijakan PO</a>
          </div>
          <a href="/admin" class="hover:text-[#6366F1] flex items-center gap-1">
            <ShieldCheck size={12} />
            <span>Login</span>
          </a>
        </div>
      </footer>
    </div>
  );
}
