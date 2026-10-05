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
        <div class="bg-[#CE2738]/10 border border-[#CE2738]/20 rounded-2xl p-3 px-4 flex items-center gap-2.5 text-xs sm:text-sm text-[#1C1917] shadow-2xs">
          <Flame size={16} class="text-[#CE2738] shrink-0" />
          <span class="font-medium">{props.announcement}</span>
        </div>
      </Show>

      {/* Main Hero Card dengan Styling Elegan & Human-Crafted */}
      <div class="p-6 sm:p-8 bg-[#FFFDF9] border border-[#E8DFD5] rounded-2xl shadow-xs relative">
        {/* Top Badges Row */}
        <div class="flex flex-wrap items-center justify-between gap-2.5 mb-4">
          <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1B872A]/10 text-[#1B872A] text-xs font-semibold border border-[#1B872A]/20">
            <span>Pre-Order Aktif • {b()?.code || "PO PURWOKERTO"}</span>
          </div>

          <div class="flex items-center gap-2">
            <Show when={b()?.freeDeliveryMin}>
              <div class="inline-flex items-center gap-1.5 text-xs font-medium text-[#CE2738] bg-[#CE2738]/10 px-2.5 py-1 rounded-full border border-[#CE2738]/20">
                <Sparkles size={12} />
                <span>Gratis Ongkir min. {formatRupiah(b()!.freeDeliveryMin!)}</span>
              </div>
            </Show>

            <span class="text-xs font-medium text-[#6C5F57] bg-[#F3ECE2] px-2.5 py-1 rounded-full border border-[#E8DFD5]">
              Sisa {remainingSlots()} Slot
            </span>
          </div>
        </div>

        {/* Hero Title & Description */}
        <div class="max-w-3xl space-y-2">
          <h1 class="font-heading text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#1C1917] tracking-tight leading-tight">
            {b()?.title || "Sistem Pre-Order Mol-Mol Purwokerto"}
          </h1>

          <p class="text-xs sm:text-sm text-[#6C5F57] leading-relaxed">
            {b()?.description ||
              "Pemesanan batch berkala untuk menjaga kelezatan, kerenyahan, dan kualitas bahan baku resep khas asli Mol-Mol Purwokerto — Dessert & Cemilan Purwokerto."}
          </p>
        </div>

        {/* Information Grid: Compact & Balanced across Mobile & Desktop */}
        <div class="mt-6 pt-5 border-t border-[#E8DFD5] grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Batas Tutup PO */}
          <div class="flex items-center sm:items-start gap-3 p-3.5 rounded-xl bg-[#FAF7F2] border border-[#E8DFD5]">
            <div class="p-2 rounded-lg bg-[#CE2738]/10 text-[#CE2738] shrink-0">
              <Clock size={16} />
            </div>
            <div class="min-w-0">
              <span class="text-[10px] uppercase font-bold text-[#8D7E73] block tracking-wider">
                Batas Tutup PO
              </span>
              <span class="text-xs sm:text-[13px] font-semibold text-[#1C1917] block truncate mt-0.5">
                {b() ? formatTanggalWIB(b()!.orderCloseAt) : "-"}
              </span>
            </div>
          </div>

          {/* Tanggal Kirim / Siap Ambil */}
          <div class="flex items-center sm:items-start gap-3 p-3.5 rounded-xl bg-[#FAF7F2] border border-[#E8DFD5]">
            <div class="p-2 rounded-lg bg-[#1B872A]/10 text-[#1B872A] shrink-0">
              <Calendar size={16} />
            </div>
            <div class="min-w-0">
              <span class="text-[10px] uppercase font-bold text-[#8D7E73] block tracking-wider">
                Jadwal Pengiriman
              </span>
              <span class="text-xs sm:text-[13px] font-semibold text-[#1C1917] block truncate mt-0.5">
                {b() ? formatTanggalWIB(b()!.deliveryDate, { includeTime: false }) : "-"}
              </span>
            </div>
          </div>

          {/* Pengantaran & Pickup */}
          <div class="flex items-center sm:items-start gap-3 p-3.5 rounded-xl bg-[#FAF7F2] border border-[#E8DFD5]">
            <div class="p-2 rounded-lg bg-[#CE2738]/10 text-[#CE2738] shrink-0">
              <Truck size={16} />
            </div>
            <div class="min-w-0">
              <span class="text-[10px] uppercase font-bold text-[#8D7E73] block tracking-wider">
                Metode Pengiriman
              </span>
              <span class="text-xs sm:text-[13px] font-semibold text-[#1C1917] block truncate mt-0.5">
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
          <div class="mt-5 pt-4 border-t border-[#E8DFD5]">
            <div class="flex items-center justify-between text-xs mb-1.5">
              <span class="font-medium text-[#6C5F57]">Kapasitas Kuota Pesanan:</span>
              <span class="text-xs font-semibold text-[#1C1917]">
                {b()!.quotaUsed} / {b()!.quotaTotal} Slot Terisi ({quotaPercent()}%)
              </span>
            </div>

            {/* Progress line */}
            <div class="w-full h-2 bg-[#E8DFD5] rounded-full overflow-hidden">
              <div
                class="h-full bg-[#CE2738] rounded-full transition-all duration-500"
                style={{ width: `${quotaPercent()}%` }}
              />
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}
