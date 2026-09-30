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
        return "bg-[#6366F1]/10 text-[#6366F1] border border-[#6366F1]/20";
      case "success":
        return "bg-[#10B981]/10 text-[#059669] border border-[#10B981]/25";
      case "warning":
        return "bg-[#F59E0B]/10 text-[#D97706] border border-[#F59E0B]/25";
      case "error":
        return "bg-[#EF4444]/10 text-[#DC2626] border border-[#EF4444]/25";
      case "secondary":
        return "bg-[#20970B]/10 text-[#20970B] border border-[#20970B]/25";
      default:
        return "bg-[#F3F4F6] text-[#4B5563] border border-[#E5E7EB]";
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
