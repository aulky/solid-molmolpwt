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
        return <Clock size={16} class="text-[#F59E0B]" />;
      case "dikonfirmasi":
        return <BadgeCheck size={16} class="text-[#6366F1]" />;
      case "diproduksi":
        return <ChefHat size={16} class="text-[#6366F1]" />;
      case "siap_diambil":
        return <PackageCheck size={16} class="text-[#20970B]" />;
      case "dikirim":
        return <Truck size={16} class="text-[#6366F1]" />;
      case "selesai":
        return <CheckCircle2 size={16} class="text-[#10B981]" />;
      case "ditolak":
      case "dibatalkan":
        return <XCircle size={16} class="text-[#EF4444]" />;
      default:
        return <Clock size={16} class="text-[#9C9C9C]" />;
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
    <div class="relative pl-11 space-y-6 before:absolute before:left-[15px] before:top-3 before:bottom-3 before:w-[2px] before:bg-[#E8E8EC]">
      <For each={props.history}>
        {(step, index) => {
          const isLatest = index() === 0;

          return (
            <div class="relative group">
              {/* Stepper Node Icon dengan Posisi Presisi & Jarak Bernapas */}
              <div
                class={`absolute left-[-44px] top-0 w-8 h-8 rounded-full flex items-center justify-center bg-white border ${
                  isLatest
                    ? "border-[#6366F1] shadow-2xs ring-2 ring-[#6366F1]/20"
                    : "border-[#E8E8EC]"
                }`}
              >
                {getStatusIcon(step.toStatus)}
              </div>

              {/* Step Content */}
              <div class="space-y-1">
                <div class="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
                  <span
                    class={`text-xs sm:text-sm font-semibold leading-snug ${
                      isLatest ? "text-[#0A0A0A]" : "text-[#6B6B6B]"
                    }`}
                  >
                    {getStatusLabel(step.toStatus)}
                  </span>
                  <span class="text-[11px] font-mono text-[#9C9C9C] shrink-0">
                    {formatTanggalWIB(step.createdAt)}
                  </span>
                </div>

                <Show when={step.note}>
                  <p class="text-xs text-[#6B6B6B] leading-relaxed bg-[#FAFAFA] p-2.5 rounded-lg border border-[#E8E8EC]/80 mt-1">
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
