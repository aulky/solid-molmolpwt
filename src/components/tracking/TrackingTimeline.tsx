import { For, Show } from "solid-js";
import { formatTanggalWIB } from "~/lib/pricing";
import {
  Clock,
  BadgeCheck,
  ChefHat,
  PackageCheck,
  Truck,
  CheckCircle2,
  XCircle,
} from "lucide-solid";

export interface StatusHistoryItem {
  id: number;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  createdAt: Date | string;
}

interface TrackingTimelineProps {
  currentStatus: string;
  history: StatusHistoryItem[];
}

export function TrackingTimeline(props: TrackingTimelineProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "menunggu_verifikasi":
        return <Clock size={16} class="text-[#E9B45B]" />;
      case "dikonfirmasi":
        return <BadgeCheck size={16} class="text-[#D92D3A]" />;
      case "diproduksi":
        return <ChefHat size={16} class="text-[#D92D3A]" />;
      case "siap_diambil":
        return <PackageCheck size={16} class="text-[#7FA37A]" />;
      case "dikirim":
        return <Truck size={16} class="text-[#D92D3A]" />;
      case "selesai":
        return <CheckCircle2 size={16} class="text-[#7FA37A]" />;
      case "ditolak":
      case "dibatalkan":
        return <XCircle size={16} class="text-[#D92D3A]" />;
      default:
        return <Clock size={16} class="text-[#806B5C]" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "menunggu_verifikasi":
        return "Menunggu Verifikasi Bukti Bayar";
      case "dikonfirmasi":
        return "Pesanan Dikonfirmasi & Pembayaran Sah";
      case "diproduksi":
        return "Sedang Diproduksi oleh Tim Mol-Mol";
      case "siap_diambil":
        return "Siap Diambil di Outlet Toko";
      case "dikirim":
        return "Sedang Diantar oleh Kurir";
      case "selesai":
        return "Pesanan Telah Selesai";
      case "ditolak":
        return "Bukti Pembayaran Ditolak Admin";
      case "dibatalkan":
        return "Pesanan Dibatalkan";
      default:
        return status;
    }
  };

  return (
    <div class="relative pl-11 space-y-6 before:absolute before:left-[15px] before:top-3 before:bottom-3 before:w-[2px] before:bg-[#E7D8C3]">
      <For each={props.history}>
        {(step, index) => {
          const isLatest = index() === 0;

          return (
            <div class="relative group">
              {/* Stepper Node Icon dengan Posisi Presisi & Jarak Bernapas */}
              <div
                class={`absolute left-[-44px] top-0 w-8 h-8 rounded-full flex items-center justify-center bg-[#FFFDF8] border ${
                  isLatest
                    ? "border-[#D92D3A] shadow-2xs ring-2 ring-[#D92D3A]/20"
                    : "border-[#E7D8C3]"
                }`}
              >
                {getStatusIcon(step.toStatus)}
              </div>

              {/* Step Content */}
              <div class="space-y-1">
                <div class="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
                  <span
                    class={`text-xs sm:text-sm font-semibold leading-snug ${
                      isLatest ? "text-[#5B4638]" : "text-[#806B5C]"
                    }`}
                  >
                    {getStatusLabel(step.toStatus)}
                  </span>
                  <span class="text-[11px] text-[#806B5C] shrink-0 font-medium">
                    {formatTanggalWIB(step.createdAt)}
                  </span>
                </div>

                <Show when={step.note}>
                  <p class="text-xs text-[#806B5C] leading-relaxed bg-[#F9EEDB] p-2.5 rounded-xl border border-[#E7D8C3] mt-1">
                    {step.note}
                  </p>
                </Show>
              </div>
            </div>
          );
        }}
      </For>
    </div>
  );
}
