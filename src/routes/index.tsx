import { createSignal, createMemo, onMount, For, Show } from "solid-js";
import { query, createAsync } from "@solidjs/router";
import { getAllActiveBatches, getActiveBatch } from "~/lib/services/batch";
import { getStoreSettings, StoreSettingsData } from "~/lib/services/settings";
import { BatchHero, BatchInfo } from "~/components/catalog/BatchHero";
import { ProductCard, CatalogProduct } from "~/components/catalog/ProductCard";
import { CheckoutModal } from "~/components/checkout/CheckoutModal";
import { Footer } from "~/components/Footer";
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
            <div class="p-3.5 sm:p-4 bg-white border border-[#E8E8EC] rounded-2xl space-y-2.5 shadow-2xs">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span class="text-xs font-bold uppercase tracking-wider text-[#0A0A0A] flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full bg-[#6366F1]" />
                  Tersedia {activeBatches().length} Gelombang Pre-Order
                </span>
                <span class="text-[11px] text-[#71717A]">
                  Pilih gelombang PO untuk melihat menu & jadwal pengiriman:
                </span>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                <For each={activeBatches()}>
                  {(b: any) => {
                    const isSelected = () => currentBatch()?.id === b.id;
                    const remaining = Math.max(0, b.quotaTotal - b.quotaUsed);
                    return (
                      <button
                        type="button"
                        onClick={() => setSelectedBatchId(b.id)}
                        class={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                          isSelected()
                            ? "bg-[#6366F1]/5 border-[#6366F1] shadow-2xs ring-1 ring-[#6366F1]/30"
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
                              <span class="text-[10px] text-[#71717A] bg-[#E8E8EC]/60 px-1.5 py-0.5 rounded font-mono">
                                Pilih
                              </span>
                            }
                          >
                            <span class="text-[10px] bg-[#6366F1] text-white px-2 py-0.5 rounded font-semibold">
                              Aktif
                            </span>
                          </Show>
                        </div>

                        <h4 class="font-heading font-semibold text-xs text-[#0A0A0A] line-clamp-1">
                          {b.title}
                        </h4>

                        <div class="flex items-center justify-between text-[11px] text-[#71717A] pt-1 border-t border-[#E8E8EC]/80">
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

          {/* Alur Pemesanan Cepat (Value Props UMKM) */}
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3.5 sm:p-4 bg-white border border-[#E8E8EC] rounded-2xl text-xs text-[#52525B] shadow-2xs">
            <div class="flex items-center gap-3">
              <div class="w-7 h-7 rounded-xl bg-[#6366F1]/10 text-[#6366F1] flex items-center justify-center font-bold text-xs shrink-0">
                1
              </div>
              <div>
                <span class="font-bold text-[#0A0A0A] block">Pilih Menu Favorit</span>
                <span class="text-[11px] text-[#71717A]">Tentukan varian & porsi cemilan</span>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="w-7 h-7 rounded-xl bg-[#6366F1]/10 text-[#6366F1] flex items-center justify-center font-bold text-xs shrink-0">
                2
              </div>
              <div>
                <span class="font-bold text-[#0A0A0A] block">Alamat / Titik GPS</span>
                <span class="text-[11px] text-[#71717A]">Pilih antar kurir atau pickup outlet</span>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="w-7 h-7 rounded-xl bg-[#10B981]/10 text-[#10B981] flex items-center justify-center font-bold text-xs shrink-0">
                3
              </div>
              <div>
                <span class="font-bold text-[#0A0A0A] block">Bayar & Lacak Order</span>
                <span class="text-[11px] text-[#71717A]">Upload bukti QRIS/transfer & lacak live</span>
              </div>
            </div>
          </div>

          {/* Section Heading Katalog */}
          <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pt-2 border-t border-[#E8E8EC]">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="text-[11px] font-mono uppercase tracking-wider text-[#6366F1] font-semibold bg-[#6366F1]/10 px-2.5 py-0.5 rounded-full">
                  Batch {currentBatch()?.code}
                </span>
                <span class="text-xs text-[#71717A]">
                  • {productList().length} Menu Tersedia
                </span>
              </div>
              <h2 class="font-heading text-xl sm:text-2xl font-extrabold text-[#0A0A0A]">
                Katalog Pre-Order
              </h2>
            </div>

            <p class="text-xs text-[#71717A]">
              Porsi diproduksi segar sesuai pesanan • Bebas bahan pengawet
            </p>
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
      <Footer adminPhone={storeSettings().adminPhone} />
    </div>
  );
}
