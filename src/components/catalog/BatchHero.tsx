import { Show } from "solid-js";
import { formatTanggalWIB, formatRupiah } from "~/lib/pricing";
import { Clock, Calendar, Truck, ShieldCheck, Flame } from "lucide-solid";

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
    <div class="w-full">
      {/* Optional Store Announcement Banner */}
      <Show when={props.announcement}>
        <div class="mb-6 bg-gradient-to-r from-[#6366F1]/10 via-[#20970B]/10 to-[#6366F1]/10 border border-[#6366F1]/20 rounded-xl p-3 px-4 flex items-center gap-2.5 text-xs sm:text-sm text-[#0A0A0A]">
          <Flame size={16} class="text-[#6366F1] shrink-0" />
          <span class="font-medium">{props.announcement}</span>
        </div>
      </Show>

      {/* Main Hero Card */}
      <div class="card-surface p-6 sm:p-8 bg-white border border-[#E8E8EC] relative overflow-hidden">
        {/* Subtle Decorative Editorial Tag */}
        <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#6366F1]/10 text-[#6366F1] font-mono text-xs font-semibold">
            PRE-ORDER AKTIF: {b()?.code || "PO PURWOKERTO"}
          </div>

          <Show when={b()?.freeDeliveryMin}>
            <div class="text-xs font-medium text-[#20970B] bg-[#20970B]/10 px-3 py-1 rounded-full border border-[#20970B]/20">
              Gratis Ongkir min. {formatRupiah(b()!.freeDeliveryMin!)}
            </div>
          </Show>
        </div>

        {/* Hero Title & Description */}
        <h1 class="font-heading text-2xl sm:text-4xl lg:text-5xl font-bold text-[#0A0A0A] tracking-tight leading-[1.15]">
          {b()?.title || "Sistem Pre-Order Mol-Mol Purwokerto"}
        </h1>

        <p class="mt-3 text-sm sm:text-base text-[#6B6B6B] max-w-2xl leading-relaxed">
          {b()?.description ||
            "Pemesanan batch berkala untuk menjaga kelezatan, kerenyahan, dan kualitas bahan baku resep khas asli Mol-Mol Purwokerto — Dessert & Cemilan Purwokerto."}
        </p>

        {/* Information Grid */}
        <div class="mt-6 pt-6 border-t border-[#E8E8EC] grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Batas Tutup PO */}
          <div class="flex items-start gap-3 p-3 rounded-lg bg-[#FAFAFA] border border-[#E8E8EC]">
            <div class="p-2 rounded-md bg-[#6366F1]/10 text-[#6366F1]">
              <Clock size={18} />
            </div>
            <div>
              <span class="text-[11px] uppercase font-mono text-[#9C9C9C] block tracking-wider">
                Batas Tutup PO
              </span>
              <span class="text-xs sm:text-sm font-semibold text-[#0A0A0A] block mt-0.5">
                {b() ? formatTanggalWIB(b()!.orderCloseAt) : "-"}
              </span>
            </div>
          </div>

          {/* Tanggal Kirim / Siap Ambil */}
          <div class="flex items-start gap-3 p-3 rounded-lg bg-[#FAFAFA] border border-[#E8E8EC]">
            <div class="p-2 rounded-md bg-[#20970B]/10 text-[#20970B]">
              <Calendar size={18} />
            </div>
            <div>
              <span class="text-[11px] uppercase font-mono text-[#9C9C9C] block tracking-wider">
                Tanggal Pengiriman
              </span>
              <span class="text-xs sm:text-sm font-semibold text-[#0A0A0A] block mt-0.5">
                {b() ? formatTanggalWIB(b()!.deliveryDate, { includeTime: false }) : "-"}
              </span>
            </div>
          </div>

          {/* Pengantaran & Pickup */}
          <div class="flex items-start gap-3 p-3 rounded-lg bg-[#FAFAFA] border border-[#E8E8EC]">
            <div class="p-2 rounded-md bg-[#6366F1]/10 text-[#6366F1]">
              <Truck size={18} />
            </div>
            <div>
              <span class="text-[11px] uppercase font-mono text-[#9C9C9C] block tracking-wider">
                Metode Tersedia
              </span>
              <span class="text-xs sm:text-sm font-semibold text-[#0A0A0A] block mt-0.5">
                {[
                  b()?.allowPickup ? "Pickup" : null,
                  b()?.allowDelivery ? "Diantar" : null,
                  b()?.allowCod ? "COD" : null,
                ]
                  .filter(Boolean)
                  .join(" • ") || "Pickup & Antar"}
              </span>
            </div>
          </div>
        </div>

        {/* Quota Progress Bar (Section 8.2 PLAN.md) */}
        <Show when={b()}>
          <div class="mt-6 pt-5 border-t border-[#E8E8EC]">
            <div class="flex items-center justify-between text-xs sm:text-sm mb-2">
              <span class="font-medium text-[#0A0A0A]">Kapasitas Kuota Batch:</span>
              <span class="font-mono font-semibold text-[#0A0A0A]">
                {b()!.quotaUsed} dari {b()!.quotaTotal} slot terisi (Sisa {remainingSlots()} slot)
              </span>
            </div>

            {/* Progress line */}
            <div class="w-full h-2.5 bg-[#F4F4F6] rounded-full overflow-hidden border border-[#E8E8EC]">
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
