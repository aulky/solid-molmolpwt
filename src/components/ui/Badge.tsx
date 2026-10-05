import { JSX } from "solid-js";

export type BadgeVariant = "default" | "primary" | "success" | "warning" | "error" | "secondary";

interface BadgeProps {
  children: JSX.Element;
  variant?: BadgeVariant;
  class?: string;
}

export function Badge(props: BadgeProps) {
  const variantClass = () => {
    switch (props.variant) {
      case "primary":
        return "bg-[#CE2738]/10 text-[#CE2738] border border-[#CE2738]/20";
      case "success":
        return "bg-[#1B872A]/10 text-[#1B872A] border border-[#1B872A]/25";
      case "warning":
        return "bg-[#D97706]/10 text-[#B45309] border border-[#D97706]/25";
      case "error":
        return "bg-[#CE2738]/10 text-[#CE2738] border border-[#CE2738]/25";
      case "secondary":
        return "bg-[#1B872A]/10 text-[#1B872A] border border-[#1B872A]/25";
      default:
        return "bg-[#F3ECE2] text-[#1C1917] border border-[#E8DFD5]";
    }
  };

  return (
    <span
      class={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium tracking-tight whitespace-nowrap ${variantClass()} ${
        props.class || ""
      }`}
    >
      {props.children}
    </span>
  );
}

export function OrderStatusBadge(props: { status: string }) {
  switch (props.status) {
    case "menunggu_verifikasi":
      return <Badge variant="warning">Menunggu Verifikasi</Badge>;
    case "dikonfirmasi":
      return <Badge variant="primary">Dikonfirmasi</Badge>;
    case "diproduksi":
      return <Badge variant="primary">Sedang Diproduksi</Badge>;
    case "siap_diambil":
      return <Badge variant="secondary">Siap Diambil</Badge>;
    case "dikirim":
      return <Badge variant="primary">Dalam Pengiriman</Badge>;
    case "selesai":
      return <Badge variant="success">Pesanan Selesai</Badge>;
    case "ditolak":
      return <Badge variant="error">Bukti Ditolak</Badge>;
    case "dibatalkan":
      return <Badge variant="error">Pesanan Dibatalkan</Badge>;
    default:
      return <Badge>{props.status}</Badge>;
  }
}
