import { A } from "@solidjs/router";
import { createSignal, onMount, For, Show } from "solid-js";
import { AdminLayout } from "~/components/admin/AdminLayout";
import { StatCard } from "~/components/admin/StatCard";
import { OrderStatusBadge } from "~/components/ui/Badge";
import { formatRupiah, formatTanggalWIB } from "~/lib/pricing";
import {
  DollarSign,
  ShoppingBag,
  Clock,
  Layers,
  ArrowRight,
  ExternalLink,
  Receipt,
  Loader2,
} from "lucide-solid";

interface DashboardData {
  recentOrders: any[];
  activeBatch: any | null;
  totalRevenue: number;
  pendingCount: number;
  totalOrders: number;
}

export default function AdminDashboardPage() {
  const [data, setData] = createSignal<DashboardData>({
    recentOrders: [],
    activeBatch: null,
    totalRevenue: 0,
    pendingCount: 0,
    totalOrders: 0,
  });
  const [isLoading, setIsLoading] = createSignal(true);

  const fetchDashboard = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/dashboard", { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  onMount(() => {
    fetchDashboard();
  });

  const remainingQuota = () => {
    const b = data().activeBatch;
    if (!b) return 0;
    return Math.max(0, b.quotaTotal - b.quotaUsed);
  };

  return (
    <AdminLayout title="Overview Penjualan & Pre-Order">
      <div class="space-y-6">
        {/* Metric Cards Grid */}
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Omzet Batch Ini"
            value={formatRupiah(data()?.totalRevenue || 0)}
            sublabel="Pesanan terkonfirmasi & valid"
            icon={<DollarSign size={20} />}
          />

          <StatCard
            label="Total Pesanan"
            value={`${data()?.totalOrders || 0} order`}
            sublabel="Masuk pada gelombang aktif"
            icon={<ShoppingBag size={20} />}
          />

          <StatCard
            label="Perlu Verifikasi"
            value={`${data()?.pendingCount || 0} bukti`}
            sublabel="Menunggu pengecekan bukti"
            icon={<Clock size={20} />}
          />

          <StatCard
            label="Sisa Kuota Batch"
            value={`${remainingQuota()} slot`}
            sublabel={`Dari total kuota ${data()?.activeBatch?.quotaTotal || 0}`}
            icon={<Layers size={20} />}
          />
        </div>

        {/* Quick Shortcuts & Batch Info */}
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Active Batch Card */}
          <div class="lg:col-span-2 card-surface p-6 bg-[#FFFDF9] border border-[#E8DFD5] rounded-2xl space-y-4 shadow-xs">
            <div class="flex items-center justify-between pb-3 border-b border-[#E8DFD5]">
              <div>
                <span class="text-xs uppercase text-[#6C5F57] block font-semibold">
                  Status Gelombang Pre-Order
                </span>
                <h3 class="font-heading font-bold text-base sm:text-lg text-[#1C1917]">
                  {data()?.activeBatch?.title || "Belum Ada Batch Aktif"}
                </h3>
              </div>

              <A
                href="/admin/batches"
                class="btn-secondary btn-sm text-xs"
              >
                Kelola Batch
              </A>
            </div>

            <Show when={data()?.activeBatch}>
              <div class="space-y-3 text-xs">
                <div class="flex items-center justify-between text-[#6C5F57]">
                  <span>Kapasitas Pemesanan Terisi:</span>
                  <span class="font-semibold text-[#1C1917]">
                    {data()!.activeBatch!.quotaUsed} / {data()!.activeBatch!.quotaTotal} slot
                  </span>
                </div>

                <div class="w-full h-2.5 bg-[#E8DFD5] rounded-full overflow-hidden">
                  <div
                    class="h-full bg-[#CE2738] rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (data()!.activeBatch!.quotaUsed / data()!.activeBatch!.quotaTotal) * 100
                        )
                      )}%`,
                    }}
                  />
                </div>

                <div class="grid grid-cols-2 gap-2 pt-1 text-xs text-[#6C5F57]">
                  <div>
                    <span>Tutup PO: </span>
                    <span class="font-medium text-[#1C1917]">
                      {formatTanggalWIB(data()!.activeBatch!.orderCloseAt)}
                    </span>
                  </div>
                  <div>
                    <span>Jadwal Pengiriman: </span>
                    <span class="font-medium text-[#1C1917]">
                      {formatTanggalWIB(data()!.activeBatch!.deliveryDate, { includeTime: false })}
                    </span>
                  </div>
                </div>
              </div>
            </Show>
          </div>

          {/* Quick Actions Panel */}
          <div class="card-surface p-6 bg-[#FFFDF9] border border-[#E8DFD5] rounded-2xl space-y-3 flex flex-col justify-between shadow-xs">
            <div>
              <h3 class="font-heading font-bold text-base text-[#1C1917] pb-2 border-b border-[#E8DFD5]">
                Aksi Cepat Operasional
              </h3>
              <p class="text-xs text-[#6C5F57] mt-2">
                Akses cepat modul harian operasional Mol-Mol Purwokerto.
              </p>
            </div>

            <div class="space-y-2 pt-2">
              <A
                href="/admin/production"
                class="btn-primary w-full flex items-center justify-center gap-2 h-9 text-xs"
              >
                <span>Cetak Rekap Produksi</span>
              </A>

              <A
                href="/admin/orders?status=menunggu_verifikasi"
                class="btn-secondary w-full flex items-center justify-center gap-2 h-9 text-xs"
              >
                <span>Verifikasi Bukti Pembayaran</span>
              </A>

              <A
                href="/admin/settings"
                class="btn-secondary w-full flex items-center justify-center gap-2 h-9 text-xs"
              >
                <span>Pengaturan Rekening & Ongkir</span>
              </A>
            </div>
          </div>
        </div>

        {/* Recent Orders Section */}
        <div class="card-surface p-6 bg-[#FFFDF9] border border-[#E8DFD5] rounded-2xl space-y-4 shadow-xs">
          <div class="flex items-center justify-between pb-3 border-b border-[#E8DFD5]">
            <div>
              <h3 class="font-heading font-bold text-lg text-[#1C1917]">
                Pesanan Pre-Order Terbaru
              </h3>
              <p class="text-xs text-[#6C5F57]">
                Daftar pesanan pelanggan yang baru saja masuk ke sistem
              </p>
            </div>

            <A
              href="/admin/orders"
              class="btn-secondary btn-sm flex items-center gap-1.5"
            >
              <span>Lihat Semua Pesanan</span>
              <ArrowRight size={14} />
            </A>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs min-w-[680px]">
              <thead class="bg-[#FAF7F2] text-[#6C5F57] border-b border-[#E8DFD5] uppercase text-[11px] font-semibold">
                <tr>
                  <th class="p-3">Kode</th>
                  <th class="p-3">Pemesan</th>
                  <th class="p-3">Pengiriman</th>
                  <th class="p-3">Total</th>
                  <th class="p-3">Status</th>
                  <th class="p-3">Waktu</th>
                  <th class="p-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#E8DFD5]">
                <For
                  each={data()?.recentOrders}
                  fallback={
                    <tr>
                      <td colspan={7} class="p-6 text-center text-[#8D7E73]">
                        Belum ada pesanan yang masuk.
                      </td>
                    </tr>
                  }
                >
                  {(order) => (
                    <tr class="hover:bg-[#FAF7F2]/60 transition">
                      <td class="p-3 font-bold text-[#CE2738]">
                        {order.shortCode}
                      </td>
                      <td class="p-3">
                        <span class="font-semibold text-[#1C1917] block">
                          {order.customerName}
                        </span>
                        <span class="text-[#6C5F57] text-[11px]">{order.customerPhone}</span>
                      </td>
                      <td class="p-3 uppercase font-medium">
                        {order.fulfillment}
                      </td>
                      <td class="p-3">
                        <span class="font-bold font-heading text-[#1C1917] block text-xs sm:text-sm">
                          {formatRupiah(order.total)}
                        </span>
                        <Show when={order.paymentProofPath}>
                          <a
                            href={order.paymentProofPath}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="inline-flex items-center gap-1 text-[11px] text-[#CE2738] hover:underline font-semibold mt-0.5"
                            title="Buka bukti pembayaran"
                          >
                            <Receipt size={11} class="text-[#CE2738]" />
                            <span>Bukti Bayar</span>
                            <ExternalLink size={10} />
                          </a>
                        </Show>
                      </td>
                      <td class="p-3">
                        <OrderStatusBadge status={order.status} />
                      </td>
                      <td class="p-3 text-[#8D7E73] text-[11px]">
                        {formatTanggalWIB(order.createdAt)}
                      </td>
                      <td class="p-3 text-right">
                        <A
                          href={`/track/${order.shortCode}`}
                          target="_blank"
                          class="text-[#CE2738] hover:underline inline-flex items-center gap-1 font-semibold"
                        >
                          <span>Detail</span>
                          <ExternalLink size={12} />
                        </A>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
