import { createSignal, Show, For } from "solid-js";
import { formatRupiah } from "~/lib/pricing";
import { QtyStepper } from "./QtyStepper";
import { Badge } from "../ui/Badge";
import { Modal } from "../ui/Modal";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  UtensilsCrossed,
  Package,
} from "lucide-solid";

export interface CatalogProduct {
  batchItemId: number;
  menuItemId: number;
  sku: string;
  name: string;
  description: string | null;
  effectivePrice: number;
  remainingStock: number | null;
  isOutOfStock: boolean;
  imagePath: string | null;
  images?: string[];
  weightGrams?: number | null;
  maxPerOrder?: number | null;
}

interface ProductCardProps {
  product: CatalogProduct;
  cartQty: number;
  onUpdateQty: (qty: number) => void;
}

export function ProductCard(props: ProductCardProps) {
  const p = () => props.product;
  const isOut = () => p().isOutOfStock;

  // Multi-image list for carousel
  const imageList = () => {
    if (Array.isArray(p().images) && p().images!.length > 0) return p().images!;
    if (p().imagePath) {
      return [p().imagePath!];
    }
    return [];
  };

  const [currentSlide, setCurrentSlide] = createSignal(0);
  const [isLightboxOpen, setIsLightboxOpen] = createSignal(false);
  let touchStartX = 0;

  const nextSlide = (e?: MouseEvent) => {
    if (e) e.stopPropagation();
    const imgs = imageList();
    if (imgs.length <= 1) return;
    setCurrentSlide((prev) => (prev + 1) % imgs.length);
  };

  const prevSlide = (e?: MouseEvent) => {
    if (e) e.stopPropagation();
    const imgs = imageList();
    if (imgs.length <= 1) return;
    setCurrentSlide((prev) => (prev - 1 + imgs.length) % imgs.length);
  };

  const handleTouchStart = (e: TouchEvent) => {
    touchStartX = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) nextSlide();
      else prevSlide();
    }
  };

  return (
    <>
      <div
        class={`card-surface card-hover flex flex-col justify-between h-full group bg-white border border-[#E8E8EC] ${
          isOut() ? "opacity-75" : ""
        }`}
      >
        {/* Product Image Area with Slider */}
        <div
          class="relative w-full aspect-4/3 sm:aspect-5/4 bg-[#F4F4F6] overflow-hidden border-b border-[#E8E8EC] select-none"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <Show
            when={imageList().length > 0}
            fallback={
              <div class="w-full h-full flex flex-col items-center justify-center text-[#9C9C9C] p-4 text-center">
                <UtensilsCrossed size={32} class="mb-2 text-[#6366F1]/50" />
                <span class="text-xs font-mono font-medium">Mol-Mol Purwokerto</span>
              </div>
            }
          >
            <img
              src={imageList()[currentSlide()]}
              alt={`${p().name} - Foto ${currentSlide() + 1}`}
              loading="lazy"
              decoding="async"
              class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-102 cursor-pointer"
              onClick={() => setIsLightboxOpen(true)}
            />

            {/* Slider Navigation Arrows (jika foto lebih dari 1) */}
            <Show when={imageList().length > 1}>
              <button
                type="button"
                onClick={prevSlide}
                class="absolute left-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/80 hover:bg-white text-[#0A0A0A] shadow-xs flex items-center justify-center transition opacity-80 hover:opacity-100 cursor-pointer"
                title="Foto Sebelumnya"
              >
                <ChevronLeft size={14} />
              </button>

              <button
                type="button"
                onClick={nextSlide}
                class="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/80 hover:bg-white text-[#0A0A0A] shadow-xs flex items-center justify-center transition opacity-80 hover:opacity-100 cursor-pointer"
                title="Foto Berikutnya"
              >
                <ChevronRight size={14} />
              </button>

              {/* Slider Dots */}
              <div class="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-1.5 pointer-events-none">
                <For each={imageList()}>
                  {(_, idx) => (
                    <span
                      class={`h-1.5 rounded-full transition-all ${
                        currentSlide() === idx()
                          ? "w-4 bg-[#6366F1]"
                          : "w-1.5 bg-black/30"
                      }`}
                    />
                  )}
                </For>
              </div>
            </Show>

            {/* Tombol Perbesar Foto */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsLightboxOpen(true);
              }}
              class="absolute top-2.5 right-2.5 w-6 h-6 rounded-md bg-black/50 hover:bg-black/75 text-white flex items-center justify-center transition cursor-pointer"
              title="Perbesar Tampilan Foto"
            >
              <Maximize2 size={12} />
            </button>
          </Show>

          {/* Floating Badges */}
          <div class="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5 pointer-events-none">
            <Show when={isOut()}>
              <Badge variant="error">Stok Habis</Badge>
            </Show>
            <Show when={!isOut() && p().remainingStock !== null && p().remainingStock! <= 10}>
              <Badge variant="warning">Sisa {p().remainingStock} slot</Badge>
            </Show>
            <Show when={!isOut() && p().remainingStock === null}>
              <Badge variant="default">Tersedia</Badge>
            </Show>
          </div>

          <Show when={p().weightGrams}>
            <div class="absolute bottom-2 right-2 bg-black/60 backdrop-blur-xs text-white text-[11px] font-mono px-2 py-0.5 rounded-[4px] pointer-events-none">
              {p().weightGrams}g
            </div>
          </Show>
        </div>

        {/* Content Area */}
        <div class="p-4 flex flex-col flex-1 justify-between">
          <div>
            <h4
              onClick={() => setIsLightboxOpen(true)}
              class="font-heading font-bold text-base sm:text-lg text-[#0A0A0A] leading-snug group-hover:text-[#6366F1] transition cursor-pointer"
            >
              {p().name}
            </h4>

            <Show when={p().description}>
              <p class="text-xs sm:text-[13px] text-[#6B6B6B] line-clamp-2 mt-1 leading-relaxed">
                {p().description}
              </p>
            </Show>
          </div>

          {/* Price & Action Row */}
          <div class="mt-4 pt-3 border-t border-[#E8E8EC] flex items-center justify-between gap-2">
            <div>
              <span class="text-[11px] text-[#9C9C9C] uppercase font-mono tracking-wider block">
                Harga
              </span>
              <span class="text-base sm:text-lg font-bold font-mono text-[#0A0A0A]">
                {formatRupiah(p().effectivePrice)}
              </span>
            </div>

            <div>
              <Show
                when={!isOut()}
                fallback={
                  <span class="text-xs font-medium text-[#EF4444] px-2 py-1 bg-[#EF4444]/10 rounded-[6px]">
                    Habis
                  </span>
                }
              >
                <Show
                  when={props.cartQty > 0}
                  fallback={
                    <button
                      type="button"
                      onClick={() => props.onUpdateQty(1)}
                      class="btn-primary btn-sm flex items-center gap-1 cursor-pointer"
                    >
                      <Plus size={14} />
                      <span>Pesan</span>
                    </button>
                  }
                >
                  <QtyStepper
                    value={props.cartQty}
                    min={0}
                    max={p().remainingStock ?? p().maxPerOrder ?? 20}
                    onChange={(q) => props.onUpdateQty(q)}
                  />
                </Show>
              </Show>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox Preview Modal */}
      <Modal
        isOpen={isLightboxOpen()}
        onClose={() => setIsLightboxOpen(false)}
        title={p().name}
        maxWidth="max-w-2xl"
      >
        <div class="space-y-4">
          <div class="relative w-full aspect-16/10 bg-[#F4F4F6] rounded-lg overflow-hidden border border-[#E8E8EC]">
            <Show
              when={imageList().length > 0}
              fallback={
                <div class="w-full h-full flex flex-col items-center justify-center text-[#9C9C9C]">
                  <UtensilsCrossed size={40} />
                </div>
              }
            >
              <img
                src={imageList()[currentSlide()]}
                alt={p().name}
                class="w-full h-full object-contain"
              />

              <Show when={imageList().length > 1}>
                <button
                  type="button"
                  onClick={prevSlide}
                  class="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow text-[#0A0A0A] flex items-center justify-center cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={nextSlide}
                  class="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow text-[#0A0A0A] flex items-center justify-center cursor-pointer"
                >
                  <ChevronRight size={16} />
                </button>
              </Show>
            </Show>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xl font-bold font-mono text-[#0A0A0A]">
                {formatRupiah(p().effectivePrice)}
              </span>
              <span class="text-xs font-mono text-[#6B6B6B]">
                Berat: {p().weightGrams || 250}g / porsi
              </span>
            </div>
            <p class="text-xs sm:text-sm text-[#6B6B6B] leading-relaxed">
              {p().description || "Dessert & cemilan khas Mol-Mol Purwokerto dibuat higienis tanpa bahan pengawet."}
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}
