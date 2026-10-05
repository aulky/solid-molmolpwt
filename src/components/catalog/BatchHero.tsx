import { Show } from "solid-js";
import { formatTanggalWIB, formatRupiah } from "~/lib/pricing";
import { Clock, Calendar, Truck, Sparkles, Flame, CheckCircle2 } from "lucide-solid";

export interface BatchInfo {
  id: number;
  code: string;
  title: string;
  description: string | null;
  orderCloseAt: Date | string;
  deliveryDate: Date | string;
  pickupStart?: string | null;
  pickupEnd?: string | null;
  quotaTotal: number;
  quotaUsed: number;
  deliveryFeeFlat: number;
  freeDeliveryMin: number | null;
  allowPickup: boolean;
  allowDelivery: boolean;
  allowCod: boolean;
}

export function BatchHero(props: { batch: BatchInfo | null; announcement?: string | null }) {
  const b = () => props.batch;

  const quotaPercent = () => {
    if (!b()) return 0;
    const pct = Math.round((b()!.quotaUsed / b()!.quotaTotal) * 100);
    return Math.min(100, Math.max(0, pct));
  };

  const remainingSlots = () => {
    if (!b()) return 0;
    return Math.max(0, b()!.quotaTotal - b()!.quotaUsed);
  };

  return (
    <div class="w-full space-y-4">
      {/* Optional Store Announcement Banner */}
      <Show when={props.announcement}>
        <div class="bg-[#D92D3A]/10 border border-[#D92D3A]/20 rounded-2xl p-3 px-4 flex items-center gap-2.5 text-xs sm:text-sm text-[#5B4638] shadow-2xs">
          <Flame size={16} class="text-[#D92D3A] shrink-0" />
          <span class="font-medium">{props.announcement}</span>
        </div>
      </Show>

      {/* Main Hero Card dengan Styling Elegan & Human-Crafted */}
      <div class="p-6 sm:p-8 bg-[#FFF9EE] border border-[#E2CCA8] rounded-2xl shadow-xs relative">
        {/* Top Badges Row */}
        <div class="flex flex-wrap items-center justify-between gap-2.5 mb-4">
          <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#7FA37A]/15 text-[#547C4F] text-xs font-semibold border border-[#7FA37A]/30">
            <span>Pre-Order Aktif • {b()?.code || "PO PURWOKERTO"}</span>
          </div>

          <div class="flex items-center gap-2">
            <Show when={b()?.freeDeliveryMin}>
              <div class="inline-flex items-center gap-1.5 text-xs font-medium text-[#D92D3A] bg-[#D92D3A]/10 px-2.5 py-1 rounded-full border border-[#D92D3A]/20">
                <Sparkles size={12} />
                <span>Gratis Ongkir min. {formatRupiah(b()!.freeDeliveryMin!)}</span>
              </div>
            </Show>

            <span class="text-xs font-medium text-[#96681E] bg-[#E9B45B]/15 px-2.5 py-1 rounded-full border border-[#E9B45B]/30">
              Sisa {remainingSlots()} Slot
            </span>
          </div>
        </div>

        {/* Hero Title & Description */}
        <div class="max-w-3xl space-y-2">
          <h1 class="font-heading text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#5B4638] tracking-tight leading-tight">
            {b()?.title || "Sistem Pre-Order Mol-Mol Purwokerto"}
          </h1>

          <p class="text-xs sm:text-sm text-[#806B5C] leading-relaxed">
            {b()?.description ||
              "Pemesanan batch berkala untuk menjaga kelezatan, kerenyahan, dan kualitas bahan baku resep khas asli Mol-Mol Purwokerto — Dessert & Cemilan Purwokerto."}
          </p>
        </div>

        {/* Information Grid: Compact & Balanced across Mobile & Desktop */}
        <div class="mt-6 pt-5 border-t border-[#E2CCA8] grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Batas Tutup PO - Soft Red Tint */}
          <div class="flex items-center sm:items-start gap-3 p-3.5 rounded-xl bg-[#D92D3A]/5 border border-[#D92D3A]/20">
            <div class="p-2 rounded-lg bg-[#D92D3A]/10 text-[#D92D3A] shrink-0">
              <Clock size={16} />
            </div>
            <div class="min-w-0">
              <span class="text-[10px] uppercase font-bold text-[#806B5C] block tracking-wider">
                Batas Tutup PO
              </span>
              <span class="text-xs sm:text-[13px] font-semibold text-[#5B4638] block truncate mt-0.5">
                {b() ? formatTanggalWIB(b()!.orderCloseAt) : "-"}
              </span>
            </div>
          </div>

          {/* Tanggal Kirim / Siap Ambil - Soft Sage Tint */}
          <div class="flex items-center sm:items-start gap-3 p-3.5 rounded-xl bg-[#7FA37A]/10 border border-[#7FA37A]/25">
            <div class="p-2 rounded-lg bg-[#7FA37A]/20 text-[#547C4F] shrink-0">
              <Calendar size={16} />
            </div>
            <div class="min-w-0">
              <span class="text-[10px] uppercase font-bold text-[#806B5C] block tracking-wider">
                Jadwal Pengiriman
              </span>
              <span class="text-xs sm:text-[13px] font-semibold text-[#5B4638] block truncate mt-0.5">
                {b() ? formatTanggalWIB(b()!.deliveryDate, { includeTime: false }) : "-"}
              </span>
            </div>
          </div>

          {/* Pengantaran & Pickup - Light Caramel Tint */}
          <div class="flex items-center sm:items-start gap-3 p-3.5 rounded-xl bg-[#E9B45B]/10 border border-[#E9B45B]/25">
            <div class="p-2 rounded-lg bg-[#E9B45B]/20 text-[#96681E] shrink-0">
              <Truck size={16} />
            </div>
            <div class="min-w-0">
              <span class="text-[10px] uppercase font-bold text-[#806B5C] block tracking-wider">
                Metode Pengiriman
              </span>
              <span class="text-xs sm:text-[13px] font-semibold text-[#5B4638] block truncate mt-0.5">
                {[
                  b()?.allowPickup ? "Pickup Outlet" : null,
                  b()?.allowDelivery ? "Diantar Kurir" : null,
                  b()?.allowCod ? "COD" : null,
                ]
                  .filter(Boolean)
                  .join(" • ") || "Pickup & Antar"}
              </span>
            </div>
          </div>
        </div>

        {/* Quota Progress Bar: Clean, sleek & Informative */}
        <Show when={b()}>
          <div class="mt-5 pt-4 border-t border-[#E2CCA8]">
            <div class="flex items-center justify-between text-xs mb-1.5">
              <span class="font-medium text-[#806B5C]">Kapasitas Kuota Pesanan:</span>
              <span class="text-xs font-semibold text-[#5B4638]">
                {b()!.quotaUsed} / {b()!.quotaTotal} Slot Terisi ({quotaPercent()}%)
              </span>
            </div>

            {/* Progress line */}
            <div class="w-full h-2 bg-[#EADCC8] rounded-full overflow-hidden">
              <div
                class="h-full bg-[#D92D3A] rounded-full transition-all duration-500"
                style={{ width: `${quotaPercent()}%` }}
              />
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}
