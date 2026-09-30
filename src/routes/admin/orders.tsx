import { createSignal, createEffect, onMount, For, Show } from "solid-js";
import { AdminLayout } from "~/components/admin/AdminLayout";
import { OrderStatusBadge } from "~/components/ui/Badge";
import { Modal } from "~/components/ui/Modal";
import { formatRupiah, formatTanggalWIB } from "~/lib/pricing";
import {
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Eye,
  ExternalLink,
  MapPin,
  Clock,
  Truck,
  ChefHat,
  PackageCheck,
  Loader2,
} from "lucide-solid";

export default function AdminOrdersPage() {
  const [orders, setOrders] = createSignal<any[]>([]);
  const [selectedStatus, setSelectedStatus] = createSignal("all");
  const [searchQuery, setSearchQuery] = createSignal("");
  const [isLoading, setIsLoading] = createSignal(false);

  // Modal Detail & Update
  const [activeOrder, setActiveOrder] = createSignal<any | null>(null);
  const [newStatus, setNewStatus] = createSignal("");
  const [adminNote, setAdminNote] = createSignal("");
  const [isUpdating, setIsUpdating] = createSignal(false);
  const [isProofZoomed, setIsProofZoomed] = createSignal(false);

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      let url = `/api/admin/orders/list?status=${encodeURIComponent(selectedStatus())}`;
      if (searchQuery().trim()) {
        url += `&search=${encodeURIComponent(searchQuery().trim())}`;
      }
      const res = await fetch(url, { credentials: "include" });
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  onMount(() => {
    fetchOrders();
  });

  const handleUpdateStatus = async (statusToSet: string) => {
    if (!activeOrder()) return;
    setIsUpdating(true);

    try {
      const res = await fetch("/api/admin/orders/status", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: activeOrder().id,
          newStatus: statusToSet,
          adminNote: adminNote().trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Gagal mengubah status");
        return;
      }

      setActiveOrder(null);
      await fetchOrders();
    } catch (err: any) {
      alert(err?.message || "Terjadi kesalahan");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <AdminLayout title="Manajemen Pesanan Pre-Order">
      <div class="space-y-6">
        {/* Filter and Search Bar */}
        <div class="card-surface p-4 bg-white border border-[#E8E8EC] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div class="flex items-center gap-2 flex-1 w-full">
            <div class="relative flex-1">
              <input
                type="text"
                value={searchQuery()}
                onInput={(e) => setSearchQuery(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchOrders()}
                placeholder="Cari nama, WhatsApp, kode MM-..."
                class="input-base pl-9 text-xs"
              />
              <Search size={14} class="absolute left-3 top-1/2 -translate-y-1/2 text-[#9C9C9C]" />
            </div>
            <button
              type="button"
              onClick={fetchOrders}
              class="btn-secondary btn-sm shrink-0"
            >
              Cari
            </button>
          </div>

          <div class="flex items-center gap-2 w-full sm:w-auto">
            <Filter size={14} class="text-[#6B6B6B] shrink-0" />
            <select
              value={selectedStatus()}
              onChange={(e) => {
                setSelectedStatus(e.currentTarget.value);
                fetchOrders();
              }}
              class="input-base text-xs py-1.5 px-3 w-full sm:w-auto"
            >
              <option value="all">Semua Status</option>
              <option value="menunggu_verifikasi">Menunggu Verifikasi</option>
              <option value="dikonfirmasi">Dikonfirmasi</option>
              <option value="diproduksi">Sedang Diproduksi</option>
              <option value="siap_diambil">Siap Diambil</option>
              <option value="dikirim">Dikirim</option>
              <option value="selesai">Selesai</option>
              <option value="ditolak">Ditolak</option>
              <option value="dibatalkan">Dibatalkan</option>
            </select>
          </div>
        </div>

        {/* Orders Table */}
        <div class="card-surface bg-white border border-[#E8E8EC] overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs min-w-[700px]">
              <thead class="bg-[#FAFAFA] text-[#6B6B6B] border-b border-[#E8E8EC] font-mono uppercase">
                <tr>
                  <th class="p-3">Kode</th>
                  <th class="p-3">Pemesan</th>
                  <th class="p-3">Layanan</th>
                  <th class="p-3">Total</th>
                  <th class="p-3">Status</th>
                  <th class="p-3">Waktu Masuk</th>
                  <th class="p-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#E8E8EC]">
                <Show when={!isLoading()} fallback={
                  <tr>
                    <td colspan={7} class="p-8 text-center text-[#6B6B6B]">
                      <Loader2 size={24} class="animate-spin mx-auto mb-2 text-[#6366F1]" />
                      <span>Memuat data pesanan...</span>
                    </td>
                  </tr>
                }>
                  <For
                    each={orders()}
                    fallback={
                      <tr>
                        <td colspan={7} class="p-8 text-center text-[#9C9C9C]">
                          Tidak ada pesanan yang sesuai dengan filter.
                        </td>
                      </tr>
                    }
                  >
                    {(o) => (
                      <tr class="hover:bg-[#FAFAFA] transition">
                        <td class="p-3 font-mono font-bold text-[#0A0A0A]">
                          {o.shortCode}
                        </td>
                        <td class="p-3">
                          <span class="font-semibold text-[#0A0A0A] block">
                            {o.customerName}
                          </span>
                          <span class="text-[#6B6B6B] font-mono">{o.customerPhone}</span>
                        </td>
                        <td class="p-3 uppercase font-medium">
                          {o.fulfillment}
                        </td>
                        <td class="p-3 font-mono font-bold text-[#0A0A0A]">
                          {formatRupiah(o.total)}
                        </td>
                        <td class="p-3">
                          <OrderStatusBadge status={o.status} />
                        </td>
                        <td class="p-3 font-mono text-[#9C9C9C]">
                          {formatTanggalWIB(o.createdAt)}
                        </td>
                        <td class="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveOrder(o);
                              setNewStatus(o.status);
                              setAdminNote("");
                            }}
                            class="btn-primary btn-sm"
                          >
                            Kelola
                          </button>
                        </td>
                      </tr>
                    )}
                  </For>
                </Show>
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Kelola Status & Bukti Bayar */}
        <Show when={activeOrder()}>
          <Modal
            isOpen={!!activeOrder()}
            onClose={() => setActiveOrder(null)}
            title={`Kelola Pesanan: ${activeOrder().shortCode}`}
            maxWidth="max-w-xl"
          >
            <div class="space-y-4 text-xs">
              {/* Ringkasan */}
              <div class="p-3 rounded-lg bg-[#FAFAFA] border border-[#E8E8EC] space-y-1.5">
                <div class="flex justify-between">
                  <span class="text-[#6B6B6B]">Pemesan:</span>
                  <span class="font-semibold text-[#0A0A0A]">
                    {activeOrder().customerName} ({activeOrder().customerPhone})
                  </span>
                </div>
                <div class="flex justify-between">
                  <span class="text-[#6B6B6B]">Pengiriman:</span>
                  <span class="font-semibold uppercase text-[#0A0A0A]">
                    {activeOrder().fulfillment}
                  </span>
                </div>
                <Show when={activeOrder().addressText}>
                  <div class="flex justify-between">
                    <span class="text-[#6B6B6B]">Alamat:</span>
                    <span class="text-[#0A0A0A] text-right font-medium max-w-xs">
                      {activeOrder().addressText}
                    </span>
                  </div>
                </Show>
                <div class="flex justify-between font-bold pt-1 border-t border-[#E8E8EC]">
                  <span>Total Tagihan:</span>
                  <span class="font-mono text-[#6366F1] text-sm">
                    {formatRupiah(activeOrder().total)}
                  </span>
                </div>
              </div>

              {/* Bukti Bayar Thumbnail */}
              <Show when={activeOrder().paymentProofPath}>
                <div class="p-3 rounded-lg bg-white border border-[#E8E8EC] space-y-2">
                  <span class="font-semibold text-[#0A0A0A] block">
                    Foto Bukti Pembayaran:
                  </span>
                  <div class="flex items-center gap-3">
                    <img
                      src={activeOrder().paymentProofPath}
                      alt="Bukti Transfer"
                      class="w-24 h-24 object-cover rounded-lg border border-[#E8E8EC] cursor-pointer hover:opacity-90"
                      onClick={() => setIsProofZoomed(true)}
                    />
                    <div>
                      <button
                        type="button"
                        onClick={() => setIsProofZoomed(true)}
                        class="text-[#6366F1] hover:underline flex items-center gap-1 font-medium"
                      >
                        <Eye size={13} />
                        <span>Perbesar Foto Bukti</span>
                      </button>
                      <span class="text-[11px] text-[#6B6B6B] block mt-1">
                        Periksa keaslian nominal dan tanggal transaksi sebelum konfirmasi.
                      </span>
                    </div>
                  </div>
                </div>
              </Show>

              {/* Input Catatan Admin */}
              <div>
                <label class="block font-semibold text-[#0A0A0A] mb-1">
                  Catatan Admin (Akan tampil pada timeline tracking pelanggan):
                </label>
                <input
                  type="text"
                  value={adminNote()}
                  onInput={(e) => setAdminNote(e.currentTarget.value)}
                  placeholder="Contoh: Bukti sah, pesanan dijadwalkan diproduksi / Alamat kurang detail..."
                  class="input-base text-xs"
                />
              </div>

              {/* Tombol Perubahan Cepat */}
              <div class="pt-2 border-t border-[#E8E8EC] space-y-2">
                <span class="font-semibold text-[#0A0A0A] block">
                  Ubah Status Tahapan Pesanan:
                </span>

                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={isUpdating()}
                    onClick={() => handleUpdateStatus("dikonfirmasi")}
                    class="btn-primary btn-sm flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <CheckCircle size={13} />
                    <span>Konfirmasi Sah</span>
                  </button>

                  <button
                    type="button"
                    disabled={isUpdating()}
                    onClick={() => handleUpdateStatus("diproduksi")}
                    class="btn-secondary btn-sm flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <ChefHat size={13} />
                    <span>Mulai Masak</span>
                  </button>

                  <button
                    type="button"
                    disabled={isUpdating()}
                    onClick={() => handleUpdateStatus("siap_diambil")}
                    class="btn-secondary btn-sm flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <PackageCheck size={13} />
                    <span>Siap Diambil</span>
                  </button>

                  <button
                    type="button"
                    disabled={isUpdating()}
                    onClick={() => handleUpdateStatus("dikirim")}
                    class="btn-secondary btn-sm flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Truck size={13} />
                    <span>Kirim Kurir</span>
                  </button>

                  <button
                    type="button"
                    disabled={isUpdating()}
                    onClick={() => handleUpdateStatus("selesai")}
                    class="btn-secondary btn-sm flex items-center justify-center gap-1 cursor-pointer text-[#10B981]"
                  >
                    <CheckCircle size={13} />
                    <span>Pesanan Selesai</span>
                  </button>

                  <button
                    type="button"
                    disabled={isUpdating()}
                    onClick={() => handleUpdateStatus("ditolak")}
                    class="btn-destructive btn-sm flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <XCircle size={13} />
                    <span>Tolak Bukti</span>
                  </button>
                </div>
              </div>
            </div>
          </Modal>
        </Show>

        {/* Modal Zoom Bukti Bayar */}
        <Show when={isProofZoomed()}>
          <Modal
            isOpen={isProofZoomed()}
            onClose={() => setIsProofZoomed(false)}
            title="Bukti Transfer Pelanggan"
          >
            <div class="flex justify-center">
              <img
                src={activeOrder()?.paymentProofPath}
                alt="Foto Bukti Pembayaran"
                class="max-h-[80vh] w-auto object-contain rounded-lg"
              />
            </div>
          </Modal>
        </Show>
      </div>
    </AdminLayout>
  );
}
