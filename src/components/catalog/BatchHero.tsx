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
        <div class="bg-gradient-to-r from-[#6366F1]/10 via-[#20970B]/10 to-[#6366F1]/10 border border-[#6366F1]/20 rounded-xl p-3 px-4 flex items-center gap-2.5 text-xs sm:text-sm text-[#0A0A0A] shadow-2xs">
          <Flame size={16} class="text-[#6366F1] shrink-0" />
          <span class="font-medium">{props.announcement}</span>
        </div>
      </Show>

      {/* Main Hero Card dengan Styling Elegan & Human-Crafted */}
      <div class="p-5 sm:p-8 bg-gradient-to-b from-white via-white to-[#FAFAFA] border border-[#E8E8EC] rounded-2xl sm:rounded-3xl shadow-xs relative overflow-hidden">
        {/* Subtle decorative background glow */}
        <div class="absolute -right-20 -top-20 w-64 h-64 bg-[#6366F1]/5 rounded-full blur-3xl pointer-events-none" />
        <div class="absolute -left-20 -bottom-20 w-64 h-64 bg-[#10B981]/5 rounded-full blur-3xl pointer-events-none" />

        {/* Top Badges Row */}
        <div class="flex flex-wrap items-center justify-between gap-2.5 mb-3.5 relative z-10">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#10B981]/10 text-[#059669] text-xs font-semibold border border-[#10B981]/20">
            <span class="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
            <span>Pre-Order Aktif: {b()?.code || "PO PURWOKERTO"}</span>
          </div>

          <div class="flex items-center gap-2">
            <Show when={b()?.freeDeliveryMin}>
              <div class="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6366F1] bg-[#6366F1]/10 px-3 py-1 rounded-full border border-[#6366F1]/20">
                <Sparkles size={12} />
                <span>Gratis Ongkir min. {formatRupiah(b()!.freeDeliveryMin!)}</span>
              </div>
            </Show>

            <span class="text-[11px] font-mono font-medium text-[#71717A] bg-[#F4F4F6] px-2.5 py-1 rounded-full border border-[#E8E8EC]">
              Sisa {remainingSlots()} Slot
            </span>
          </div>
        </div>

        {/* Hero Title & Description */}
        <div class="relative z-10 max-w-3xl">
          <h1 class="font-heading text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#0A0A0A] tracking-tight leading-tight">
            {b()?.title || "Sistem Pre-Order Mol-Mol Purwokerto"}
          </h1>

          <p class="mt-2 text-xs sm:text-sm text-[#52525B] leading-relaxed">
            {b()?.description ||
              "Pemesanan batch berkala untuk menjaga kelezatan, kerenyahan, dan kualitas bahan baku resep khas asli Mol-Mol Purwokerto — Dessert & Cemilan Purwokerto."}
          </p>
        </div>

        {/* Information Grid: Compact & Balanced across Mobile & Desktop */}
        <div class="mt-5 pt-5 border-t border-[#E8E8EC] grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4 relative z-10">
          {/* Batas Tutup PO */}
          <div class="flex items-center sm:items-start gap-3 p-3 rounded-xl bg-white border border-[#E8E8EC] shadow-2xs">
            <div class="p-2 rounded-lg bg-[#6366F1]/10 text-[#6366F1] shrink-0">
              <Clock size={16} />
            </div>
            <div class="min-w-0">
              <span class="text-[10px] uppercase font-bold text-[#9C9C9C] block tracking-wider">
                Batas Tutup PO
              </span>
              <span class="text-xs sm:text-[13px] font-semibold text-[#0A0A0A] block truncate mt-0.5">
                {b() ? formatTanggalWIB(b()!.orderCloseAt) : "-"}
              </span>
            </div>
          </div>

          {/* Tanggal Kirim / Siap Ambil */}
          <div class="flex items-center sm:items-start gap-3 p-3 rounded-xl bg-white border border-[#E8E8EC] shadow-2xs">
            <div class="p-2 rounded-lg bg-[#10B981]/10 text-[#10B981] shrink-0">
              <Calendar size={16} />
            </div>
            <div class="min-w-0">
              <span class="text-[10px] uppercase font-bold text-[#9C9C9C] block tracking-wider">
                Jadwal Pengiriman
              </span>
              <span class="text-xs sm:text-[13px] font-semibold text-[#0A0A0A] block truncate mt-0.5">
                {b() ? formatTanggalWIB(b()!.deliveryDate, { includeTime: false }) : "-"}
              </span>
            </div>
          </div>

          {/* Pengantaran & Pickup */}
          <div class="flex items-center sm:items-start gap-3 p-3 rounded-xl bg-white border border-[#E8E8EC] shadow-2xs">
            <div class="p-2 rounded-lg bg-[#6366F1]/10 text-[#6366F1] shrink-0">
              <Truck size={16} />
            </div>
            <div class="min-w-0">
              <span class="text-[10px] uppercase font-bold text-[#9C9C9C] block tracking-wider">
                Metode Pengiriman
              </span>
              <span class="text-xs sm:text-[13px] font-semibold text-[#0A0A0A] block truncate mt-0.5">
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
          <div class="mt-4 pt-4 border-t border-[#E8E8EC] relative z-10">
            <div class="flex items-center justify-between text-xs mb-1.5">
              <span class="font-medium text-[#52525B]">Kapasitas Kuota Pesanan:</span>
              <span class="font-mono text-xs font-semibold text-[#0A0A0A]">
                {b()!.quotaUsed} / {b()!.quotaTotal} Slot Terisi ({quotaPercent()}%)
              </span>
            </div>

            {/* Progress line */}
            <div class="w-full h-2 bg-[#E8E8EC]/80 rounded-full overflow-hidden">
              <div
                class="h-full bg-gradient-to-r from-[#6366F1] to-[#4F46E5] rounded-full transition-all duration-500"
                style={{ width: `${quotaPercent()}%` }}
              />
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}
