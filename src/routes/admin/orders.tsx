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
  Receipt,
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
  const [orderError, setOrderError] = createSignal<string | null>(null);
  const [quickUpdatingId, setQuickUpdatingId] = createSignal<string | null>(null);

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

  const handleQuickUpdate = async (orderId: string, statusToSet: string) => {
    setQuickUpdatingId(orderId);
    setOrderError(null);
    try {
      const res = await fetch("/api/admin/orders/status", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          newStatus: statusToSet,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setOrderError(data.error || "Gagal mengubah status pesanan");
      } else {
        await fetchOrders();
      }
    } catch (err: any) {
      setOrderError(err?.message || "Terjadi kesalahan saat memproses status pesanan");
    } finally {
      setQuickUpdatingId(null);
    }
  };

  const handleUpdateStatus = async (statusToSet: string) => {
    if (!activeOrder()) return;
    setIsUpdating(true);
    setOrderError(null);

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
        setOrderError(data.error || "Gagal mengubah status pesanan");
        return;
      }

      setActiveOrder(null);
      await fetchOrders();
    } catch (err: any) {
      setOrderError(err?.message || "Terjadi kesalahan");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <AdminLayout title="Manajemen Pesanan Pre-Order">
      <div class="space-y-6">
        <Show when={orderError()}>
          <div class="p-3.5 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/20 flex items-center justify-between text-xs text-[#EF4444]">
            <span>{orderError()}</span>
            <button
              type="button"
              onClick={() => setOrderError(null)}
              class="font-semibold underline cursor-pointer text-[11px]"
            >
              Tutup
            </button>
          </div>
        </Show>
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
                          <span class="text-[#6B6B6B] text-[11px] block">{o.customerPhone}</span>
                        </td>
                        <td class="p-3">
                          <span class="uppercase font-semibold text-[11px] block text-[#0A0A0A]">
                            {o.fulfillment}
                          </span>
                          <Show when={o.latitude && o.longitude}>
                            <a
                              href={`https://maps.google.com/?q=${o.latitude},${o.longitude}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              class="inline-flex items-center gap-1 text-[11px] text-[#6366F1] hover:underline font-medium mt-0.5"
                              title="Buka titik koordinat di Google Maps"
                            >
                              <MapPin size={11} class="text-[#6366F1]" />
                              <span>Peta GPS</span>
                              <ExternalLink size={10} />
                            </a>
                          </Show>
                        </td>
                        <td class="p-3">
                          <span class="font-semibold text-[#0A0A0A] block">
                            {formatRupiah(o.total)}
                          </span>
                          <Show
                            when={o.paymentProofPath}
                            fallback={
                              <Show when={o.fulfillment === "cod"}>
                                <span class="text-[10px] text-[#9C9C9C] block mt-0.5">
                                  Bayar COD
                                </span>
                              </Show>
                            }
                          >
                            <a
                              href={o.paymentProofPath}
                              target="_blank"
                              rel="noopener noreferrer"
                              class="inline-flex items-center gap-1 text-[11px] text-[#6366F1] hover:underline font-medium mt-0.5"
                              title="Buka foto bukti transaksi / pembayaran"
                            >
                              <Receipt size={11} class="text-[#6366F1]" />
                              <span>Bukti Bayar</span>
                              <ExternalLink size={10} />
                            </a>
                          </Show>
                        </td>
                        <td class="p-3">
                          <OrderStatusBadge status={o.status} />
                        </td>
                        <td class="p-3 text-[#6B6B6B] text-[11px]">
                          {formatTanggalWIB(o.createdAt)}
                        </td>
                        <td class="p-3 text-right">
                          <div class="inline-flex items-center gap-1.5 justify-end">
                            {/* Tombol Cepat Konfirmasi / Tahapan Order (Requirement 2) */}
                            <Show when={o.status === "menunggu_verifikasi"}>
                              <button
                                type="button"
                                disabled={quickUpdatingId() === o.id}
                                onClick={() => handleQuickUpdate(o.id, "dikonfirmasi")}
                                class="px-2.5 py-1 rounded bg-[#10B981] hover:bg-[#059669] text-white text-[11px] font-semibold flex items-center gap-1 shadow-2xs transition cursor-pointer disabled:opacity-50"
                                title="1-Klik Konfirmasi Pembayaran Sah"
                              >
                                <Show when={quickUpdatingId() === o.id} fallback={<CheckCircle size={12} />}>
                                  <Loader2 size={12} class="animate-spin" />
                                </Show>
                                <span>ACC Order</span>
                              </button>
                            </Show>
                            <Show when={o.status === "dikonfirmasi"}>
                              <button
                                type="button"
                                disabled={quickUpdatingId() === o.id}
                                onClick={() => handleQuickUpdate(o.id, "diproduksi")}
                                class="px-2.5 py-1 rounded bg-[#6366F1] hover:bg-[#4F46E5] text-white text-[11px] font-semibold flex items-center gap-1 shadow-2xs transition cursor-pointer disabled:opacity-50"
                                title="1-Klik Mulai Masak / Produksi"
                              >
                                <Show when={quickUpdatingId() === o.id} fallback={<ChefHat size={12} />}>
                                  <Loader2 size={12} class="animate-spin" />
                                </Show>
                                <span>Mulai Masak</span>
                              </button>
                            </Show>
                            <Show when={o.status === "diproduksi"}>
                              <button
                                type="button"
                                disabled={quickUpdatingId() === o.id}
                                onClick={() => handleQuickUpdate(o.id, o.fulfillment === "pickup" ? "siap_diambil" : "dikirim")}
                                class="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold flex items-center gap-1 shadow-2xs transition cursor-pointer disabled:opacity-50"
                                title="1-Klik Tandai Siap Diambil / Kirim"
                              >
                                <Show when={quickUpdatingId() === o.id} fallback={<PackageCheck size={12} />}>
                                  <Loader2 size={12} class="animate-spin" />
                                </Show>
                                <span>Siap {o.fulfillment === "pickup" ? "Ambil" : "Kirim"}</span>
                              </button>
                            </Show>

                            <button
                              type="button"
                              onClick={() => {
                                setActiveOrder(o);
                                setNewStatus(o.status);
                                setAdminNote(o.adminNote || "");
                              }}
                              class="btn-secondary btn-sm text-[11px] h-7 px-2.5 cursor-pointer"
                            >
                              Detail
                            </button>
                          </div>
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
            title={`Kelola Pesanan: ${activeOrder()?.shortCode}`}
            maxWidth="max-w-xl"
          >
            <div class="space-y-4 text-xs">
              {/* Ringkasan */}
              <div class="p-3 rounded-lg bg-[#FAFAFA] border border-[#E8E8EC] space-y-1.5">
                <div class="flex justify-between">
                  <span class="text-[#6B6B6B]">Pemesan:</span>
                  <span class="font-semibold text-[#0A0A0A]">
                    {activeOrder()?.customerName} ({activeOrder()?.customerPhone})
                  </span>
                </div>
                <div class="flex justify-between">
                  <span class="text-[#6B6B6B]">Pengiriman:</span>
                  <span class="font-semibold uppercase text-[#0A0A0A]">
                    {activeOrder()?.fulfillment}
                  </span>
                </div>
                <Show when={activeOrder()?.addressText}>
                  <div class="flex justify-between">
                    <span class="text-[#6B6B6B]">Alamat:</span>
                    <span class="text-[#0A0A0A] text-right font-medium max-w-xs">
                      {activeOrder()?.addressText}
                    </span>
                  </div>
                </Show>
                <div class="flex justify-between font-bold pt-1 border-t border-[#E8E8EC]">
                  <span>Total Tagihan:</span>
                  <span class="font-bold text-[#6366F1] text-sm">
                    {formatRupiah(activeOrder()?.total || 0)}
                  </span>
                </div>
              </div>

              {/* Rincian Titik Koordinat GPS Lengkap (Requirement 1) */}
              <Show when={activeOrder()?.latitude && activeOrder()?.longitude}>
                <div class="p-3.5 rounded-xl bg-[#6366F1]/5 border border-[#6366F1]/20 space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="font-semibold text-xs text-[#0A0A0A] flex items-center gap-1.5">
                      <MapPin size={15} class="text-[#6366F1]" />
                      <span>Informasi Titik Koordinat GPS Pemesan</span>
                    </span>
                    <span class="text-[10px] bg-[#6366F1]/10 text-[#6366F1] font-semibold px-2 py-0.5 rounded-full">
                      {activeOrder()?.locationSource === "gps_device"
                        ? "Deteksi GPS Otomatis"
                        : activeOrder()?.locationSource === "maps_pin"
                        ? "Pin Google Maps"
                        : "Koordinat Presisi"}
                    </span>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#4B5563]">
                    <div>
                      <span class="text-[#6B6B6B] block text-[11px]">Latitude, Longitude:</span>
                      <span class="font-bold text-[#0A0A0A] select-all">
                        {activeOrder()?.latitude}, {activeOrder()?.longitude}
                      </span>
                    </div>
                    <Show when={activeOrder()?.gpsAccuracyM}>
                      <div>
                        <span class="text-[#6B6B6B] block text-[11px]">Estimasi Akurasi:</span>
                        <span class="font-medium text-[#0A0A0A]">
                          ±{activeOrder()?.gpsAccuracyM} meter dari perangkat
                        </span>
                      </div>
                    </Show>
                  </div>

                  <Show when={activeOrder()?.addressNote}>
                    <div class="text-xs pt-1 border-t border-[#6366F1]/10">
                      <span class="text-[#6B6B6B]">Patokan / Catatan Alamat:</span>
                      <span class="font-medium text-[#0A0A0A] block">{activeOrder()?.addressNote}</span>
                    </div>
                  </Show>

                  <div class="pt-1.5">
                    <a
                      href={`https://maps.google.com/?q=${activeOrder()?.latitude},${activeOrder()?.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="btn-primary btn-sm w-full flex items-center justify-center gap-2 text-xs py-2 shadow-xs cursor-pointer"
                    >
                      <MapPin size={14} />
                      <span>Buka Rute Pengantaran di Google Maps</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              </Show>

              {/* Rincian Menu Pesanan Pelanggan */}
              <Show when={activeOrder()?.items && activeOrder()?.items.length > 0}>
                <div class="p-3.5 rounded-xl bg-white border border-[#E8E8EC] space-y-2">
                  <span class="font-semibold text-xs text-[#0A0A0A] block">
                    Menu yang Dipesan ({activeOrder()?.items.length} item):
                  </span>
                  <div class="divide-y divide-[#F4F4F6]">
                    <For each={activeOrder()?.items}>
                      {(item: any) => (
                        <div class="py-1.5 flex items-center justify-between text-xs">
                          <div>
                            <span class="font-medium text-[#0A0A0A] block">{item.name}</span>
                            <span class="text-[11px] text-[#6B6B6B]">
                              {item.qty} porsi × {formatRupiah(item.price)}
                              {item.notes ? ` • Catatan: ${item.notes}` : ""}
                            </span>
                          </div>
                          <span class="font-semibold text-[#0A0A0A]">{formatRupiah(item.subtotal)}</span>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              {/* Bukti Bayar Thumbnail */}
              <Show when={activeOrder()?.paymentProofPath}>
                <div class="p-3 rounded-lg bg-white border border-[#E8E8EC] space-y-2">
                  <span class="font-semibold text-[#0A0A0A] block">
                    Foto Bukti Pembayaran:
                  </span>
                  <div class="flex items-center gap-3">
                    <img
                      src={activeOrder()?.paymentProofPath}
                      alt="Bukti Transfer"
                      class="w-24 h-24 object-cover rounded-lg border border-[#E8E8EC] cursor-pointer hover:opacity-90"
                      onClick={() => setIsProofZoomed(true)}
                    />
                    <div>
                      <button
                        type="button"
                        onClick={() => setIsProofZoomed(true)}
                        class="text-[#6366F1] hover:underline flex items-center gap-1 font-medium cursor-pointer"
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
