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
        return "bg-[#D92D3A]/10 text-[#D92D3A] border border-[#D92D3A]/20";
      case "success":
        return "bg-[#7FA37A]/15 text-[#547C4F] border border-[#7FA37A]/30";
      case "warning":
        return "bg-[#E9B45B]/15 text-[#96681E] border border-[#E9B45B]/30";
      case "error":
        return "bg-[#D92D3A]/10 text-[#D92D3A] border border-[#D92D3A]/25";
      case "secondary":
        return "bg-[#7FA37A]/15 text-[#547C4F] border border-[#7FA37A]/30";
      default:
        return "bg-[#F9EEDB] text-[#5B4638] border border-[#E7D8C3]";
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
