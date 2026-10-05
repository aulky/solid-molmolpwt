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
        return <Clock size={16} class="text-[#D97706]" />;
      case "dikonfirmasi":
        return <BadgeCheck size={16} class="text-[#CE2738]" />;
      case "diproduksi":
        return <ChefHat size={16} class="text-[#CE2738]" />;
      case "siap_diambil":
        return <PackageCheck size={16} class="text-[#1B872A]" />;
      case "dikirim":
        return <Truck size={16} class="text-[#CE2738]" />;
      case "selesai":
        return <CheckCircle2 size={16} class="text-[#1B872A]" />;
      case "ditolak":
      case "dibatalkan":
        return <XCircle size={16} class="text-[#CE2738]" />;
      default:
        return <Clock size={16} class="text-[#8D7E73]" />;
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
    <div class="relative pl-11 space-y-6 before:absolute before:left-[15px] before:top-3 before:bottom-3 before:w-[2px] before:bg-[#E8DFD5]">
      <For each={props.history}>
        {(step, index) => {
          const isLatest = index() === 0;

          return (
            <div class="relative group">
              {/* Stepper Node Icon dengan Posisi Presisi & Jarak Bernapas */}
              <div
                class={`absolute left-[-44px] top-0 w-8 h-8 rounded-full flex items-center justify-center bg-[#FFFDF9] border ${
                  isLatest
                    ? "border-[#CE2738] shadow-2xs ring-2 ring-[#CE2738]/20"
                    : "border-[#E8DFD5]"
                }`}
              >
                {getStatusIcon(step.toStatus)}
              </div>

              {/* Step Content */}
              <div class="space-y-1">
                <div class="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
                  <span
                    class={`text-xs sm:text-sm font-semibold leading-snug ${
                      isLatest ? "text-[#1C1917]" : "text-[#6C5F57]"
                    }`}
                  >
                    {getStatusLabel(step.toStatus)}
                  </span>
                  <span class="text-[11px] text-[#8D7E73] shrink-0 font-medium">
                    {formatTanggalWIB(step.createdAt)}
                  </span>
                </div>

                <Show when={step.note}>
                  <p class="text-xs text-[#6C5F57] leading-relaxed bg-[#FAF7F2] p-2.5 rounded-xl border border-[#E8DFD5] mt-1">
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
