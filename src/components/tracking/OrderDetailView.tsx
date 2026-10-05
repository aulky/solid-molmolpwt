import { createSignal, Show, For } from "solid-js";
import { formatRupiah, formatTanggalWIB } from "~/lib/pricing";
import { OrderStatusBadge } from "../ui/Badge";
import { TrackingTimeline } from "./TrackingTimeline";
import { Modal } from "../ui/Modal";
import {
  ExternalLink,
  MapPin,
  Calendar,
  Phone,
  Package,
  Receipt,
  Eye,
  Clock,
} from "lucide-solid";

interface OrderDetailViewProps {
  order: any;
  adminPhone: string;
  storeSettings?: any;
}

export function OrderDetailView(props: OrderDetailViewProps) {
  const [isProofModalOpen, setIsProofModalOpen] = createSignal(false);
  const o = () => props.order;

  const mapsUrl = () => {
    if (o()?.latitude && o()?.longitude) {
      return `https://maps.google.com/?q=${o()!.latitude},${o()!.longitude}`;
    }
    return null;
  };

  const pickupAddressText = () => {
    return (
      o()?.batch?.pickupAddress ||
      props.storeSettings?.pickupAddress ||
      "Jl. Prof. Dr. Suharso No. 45, Arcawinangun, Purwokerto Timur (Outlet Mol-Mol)"
    );
  };

  const pickupMapsUrl = () => {
    if (o()?.batch?.pickupMapsUrl) return o().batch.pickupMapsUrl;
    if (o()?.batch?.pickupLatitude && o()?.batch?.pickupLongitude) {
      return `https://maps.google.com/?q=${o().batch.pickupLatitude},${o().batch.pickupLongitude}`;
    }
    if (props.storeSettings?.pickupMapsUrl) return props.storeSettings.pickupMapsUrl;
    if (props.storeSettings?.pickupLatitude && props.storeSettings?.pickupLongitude) {
      return `https://maps.google.com/?q=${props.storeSettings.pickupLatitude},${props.storeSettings.pickupLongitude}`;
    }
    return null;
  };

  const fulfillmentText = () => {
    switch (o()?.fulfillment) {
      case "pickup":
        return "Ambil di Tempat (Pickup)";
      case "delivery":
        return "Diantar Kurir";
      case "cod":
        return "COD (Bayar di Tempat)";
      default:
        return o()?.fulfillment;
    }
  };

  return (
    <div class="space-y-6">
      {/* Top Banner Card */}
      <div class="card-surface p-4 sm:p-6 bg-[#FFFDF9] border border-[#E8DFD5] rounded-2xl space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-4 border-b border-[#E8DFD5]">
          <div class="flex items-center justify-between sm:block gap-2">
            <div>
              <span class="text-xs uppercase text-[#6C5F57] block tracking-wider font-semibold">
                Kode Pesanan
              </span>
              <h2 class="font-heading font-bold text-2xl sm:text-3xl text-[#CE2738] leading-tight">
                {o().shortCode}
              </h2>
            </div>

            {/* Tampilan Mobile: Badge status diletakkan sejajar di samping kanan Kode Pesanan agar tidak jatuh ke bawah */}
            <div class="sm:hidden flex flex-col items-end gap-1">
              <OrderStatusBadge status={o().status} />
              <span class="text-[10px] text-[#8D7E73]">
                {formatTanggalWIB(o().createdAt, { includeTime: false })}
              </span>
            </div>
          </div>

          {/* Tampilan Desktop */}
          <div class="hidden sm:flex flex-col items-end gap-1.5">
            <OrderStatusBadge status={o().status} />
            <span class="text-xs text-[#8D7E73]">
              Dipesan: {formatTanggalWIB(o().createdAt)}
            </span>
          </div>
        </div>

        {/* Info Grid */}
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          {/* Customer */}
          <div class="p-3 rounded-xl bg-[#FAF7F2] border border-[#E8DFD5] space-y-1">
            <span class="text-[#8D7E73] block uppercase font-semibold text-[10px]">Pemesan</span>
            <span class="font-semibold text-sm text-[#1C1917] block">
              {o().customerName}
            </span>
            <span class="text-[#6C5F57] block font-medium">{o().customerPhone}</span>
          </div>

          {/* Fulfillment */}
          <div class="p-3 rounded-xl bg-[#FAF7F2] border border-[#E8DFD5] space-y-1">
            <span class="text-[#8D7E73] block uppercase font-semibold text-[10px]">Metode Pengiriman</span>
            <span class="font-semibold text-sm text-[#1C1917] block">
              {fulfillmentText()}
            </span>
            <Show when={o().batch?.deliveryDate}>
              <span class="text-[#6C5F57] flex items-center gap-1 font-medium">
                <Calendar size={12} />
                <span>Kirim: {formatTanggalWIB(o().batch.deliveryDate, { includeTime: false })}</span>
              </span>
            </Show>
          </div>

          {/* Payment Method */}
          <div class="p-3 rounded-xl bg-[#FAF7F2] border border-[#E8DFD5] space-y-1">
            <span class="text-[#8D7E73] block uppercase font-semibold text-[10px]">Pembayaran</span>
            <span class="font-semibold text-sm text-[#1C1917] block uppercase">
              {o().paymentMethod}
            </span>
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-[#CE2738] font-heading">
                Total: {formatRupiah(o().total)}
              </span>
              <Show when={o().paymentProofPath}>
                <button
                  type="button"
                  onClick={() => setIsProofModalOpen(true)}
                  class="text-[11px] text-[#CE2738] hover:underline flex items-center gap-0.5 cursor-pointer font-semibold"
                >
                  <Eye size={12} />
                  <span>Lihat Bukti</span>
                </button>
              </Show>
            </div>
          </div>
        </div>

        {/* Address and GPS if Delivery */}
        <Show when={o().fulfillment !== "pickup"}>
          <div class="p-4 rounded-xl bg-[#FAF7F2] border border-[#E8DFD5] space-y-2 text-xs">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-[#1C1917] flex items-center gap-1.5">
                <MapPin size={15} class="text-[#CE2738]" />
                <span>Alamat Pengiriman:</span>
              </span>
              <Show when={mapsUrl()}>
                <a
                  href={mapsUrl()!}
                  target="_blank"
                  rel="noreferrer"
                  class="text-[#CE2738] hover:underline flex items-center gap-1 text-xs font-medium"
                >
                  <span>Buka di Google Maps</span>
                  <ExternalLink size={12} />
                </a>
              </Show>
            </div>

            <p class="text-[#1C1917] font-medium leading-relaxed">
              {o().addressText || "-"}
            </p>

            <Show when={o().addressNote}>
              <p class="text-[11px] text-[#6C5F57]">
                Catatan Alamat: {o().addressNote}
              </p>
            </Show>
          </div>
        </Show>

        {/* Outlet Pickup Location if Pickup */}
        <Show when={o().fulfillment === "pickup"}>
          <div class="p-4 rounded-xl bg-[#FAF7F2] border border-[#E8DFD5] space-y-2 text-xs">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-[#1C1917] flex items-center gap-1.5">
                <MapPin size={15} class="text-[#CE2738]" />
                <span>Titik & Alamat Pengambilan Mandiri (Pickup):</span>
              </span>
              <Show when={pickupMapsUrl()}>
                <a
                  href={pickupMapsUrl()!}
                  target="_blank"
                  rel="noreferrer"
                  class="text-[#CE2738] hover:underline flex items-center gap-1 font-medium text-xs"
                >
                  <span>Buka di Google Maps</span>
                  <ExternalLink size={12} />
                </a>
              </Show>
            </div>

            <p class="text-[#1C1917] font-medium leading-relaxed">
              {pickupAddressText()}
            </p>

            <Show when={o().batch?.pickupStart && o().batch?.pickupEnd}>
              <div class="flex items-center gap-1.5 text-xs text-[#6C5F57] pt-0.5">
                <Clock size={13} class="text-[#CE2738]" />
                <span>
                  Waktu Pengambilan: Jam {o().batch.pickupStart} - {o().batch.pickupEnd} WIB
                </span>
              </div>
            </Show>
          </div>
        </Show>
      </div>

      {/* Stepper Timeline & Order Items Grid */}
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Timeline (Left) */}
        <div class="lg:col-span-6 card-surface p-6 bg-[#FFFDF9] border border-[#E8DFD5] space-y-4 rounded-2xl">
          <h3 class="font-heading font-semibold text-base text-[#1C1917] pb-2 border-b border-[#E8DFD5]">
            Riwayat Status Pesanan
          </h3>

          <TrackingTimeline currentStatus={o().status} history={o().history || []} />
        </div>

        {/* Items Breakdown (Right) */}
        <div class="lg:col-span-6 card-surface p-6 bg-[#FFFDF9] border border-[#E8DFD5] space-y-4 flex flex-col justify-between rounded-2xl">
          <div>
            <h3 class="font-heading font-semibold text-base text-[#1C1917] pb-2 border-b border-[#E8DFD5] flex items-center justify-between">
              <span>Rincian Menu Pesanan</span>
              <Package size={16} class="text-[#CE2738]" />
            </h3>

            <div class="divide-y divide-[#E8DFD5] mt-2">
              <For each={o().items}>
                {(item: any) => (
                  <div class="py-2.5 flex items-center justify-between text-xs sm:text-sm">
                    <div>
                      <span class="font-medium text-[#1C1917]">{item.nameSnapshot}</span>
                      <span class="text-[#6C5F57] block text-xs">
                        {item.qty} × {formatRupiah(item.unitPrice)}
                      </span>
                    </div>
                    <span class="font-semibold text-[#1C1917]">
                      {formatRupiah(item.lineTotal)}
                    </span>
                  </div>
                )}
              </For>
            </div>
          </div>

          {/* Pricing Totals & WA Button */}
          <div class="space-y-4 pt-4 border-t border-[#E8DFD5]">
            <div class="space-y-1.5 text-xs text-[#6C5F57]">
              <div class="flex justify-between">
                <span>Subtotal Menu:</span>
                <span class="font-semibold text-[#1C1917]">{formatRupiah(o().subtotal)}</span>
              </div>
              <div class="flex justify-between">
                <span>Ongkos Kirim:</span>
                <span class="text-[#1C1917]">
                  {o().deliveryFee === 0 ? "GRATIS" : formatRupiah(o().deliveryFee)}
                </span>
              </div>
              <div class="flex justify-between text-base font-bold text-[#1C1917] pt-2 border-t border-[#E8DFD5]">
                <span>Total:</span>
                <span class="font-heading font-bold text-[#CE2738]">{formatRupiah(o().total)}</span>
              </div>
            </div>

            <a
              href={`https://wa.me/${props.adminPhone}?text=${encodeURIComponent(
                `Halo Admin Mol-Mol, saya ingin menanyakan status pesanan saya dengan Kode ${o().shortCode} (${o().customerName}). Terima kasih.`
              )}`}
              target="_blank"
              rel="noreferrer"
              class="btn-secondary w-full flex items-center justify-center gap-2"
            >
              <Phone size={15} />
              <span>Hubungi Admin via WhatsApp</span>
            </a>
          </div>
        </div>
      </div>

      {/* Proof Zoom Modal */}
      <Modal
        isOpen={isProofModalOpen()}
        onClose={() => setIsProofModalOpen(false)}
        title="Foto Bukti Pembayaran"
      >
        <div class="flex flex-col items-center">
          <img
            src={o().paymentProofPath}
            alt="Bukti Transfer"
            class="max-h-[75vh] w-auto object-contain rounded-2xl border border-[#E8DFD5]"
          />
        </div>
      </Modal>
    </div>
  );
}
