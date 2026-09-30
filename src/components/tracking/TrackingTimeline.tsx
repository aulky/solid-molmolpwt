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
    <div class="relative pl-6 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-[#E8E8EC]">
      <For each={props.history}>
        {(step, index) => {
          const isLatest = index() === 0;

          return (
            <div class="relative group">
              {/* Stepper Node Icon */}
              <div
                class={`absolute -left-6 top-0 w-6 h-6 rounded-full flex items-center justify-center bg-white border ${
                  isLatest
                    ? "border-[#6366F1] shadow-xs"
                    : "border-[#E8E8EC]"
                }`}
              >
                {getStatusIcon(step.toStatus)}
              </div>

              {/* Step Content */}
              <div class="space-y-1">
                <div class="flex flex-wrap items-baseline gap-2">
                  <span
                    class={`text-xs sm:text-sm font-semibold ${
                      isLatest ? "text-[#0A0A0A]" : "text-[#6B6B6B]"
                    }`}
                  >
                    {getStatusLabel(step.toStatus)}
                  </span>
                  <span class="text-[11px] font-mono text-[#9C9C9C]">
                    {formatTanggalWIB(step.createdAt)}
                  </span>
                </div>

                <Show when={step.note}>
                  <p class="text-xs text-[#6B6B6B] leading-relaxed">
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
