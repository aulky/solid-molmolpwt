import { createSignal, onMount, For, Show } from "solid-js";
import { AdminLayout } from "~/components/admin/AdminLayout";
import { Printer, Download, Utensils, RefreshCw } from "lucide-solid";

export default function AdminProductionPage() {
  const [batches, setBatches] = createSignal<any[]>([]);
  const [selectedBatchId, setSelectedBatchId] = createSignal<number | null>(null);
  const [productionList, setProductionList] = createSignal<any[]>([]);
  const [isLoading, setIsLoading] = createSignal(false);

  const fetchBatches = async () => {
    try {
      const res = await fetch("/api/admin/batches", { credentials: "include" });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setBatches(data);
        setSelectedBatchId(data[0].id);
        fetchSummary(data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSummary = async (bId: number) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/production?batchId=${bId}`, { credentials: "include" });
      const data = await res.json();
      setProductionList(Array.isArray(data.summary) ? data.summary : []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  onMount(() => {
    fetchBatches();
  });

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const handleExportCSV = () => {
    if (!selectedBatchId()) return;
    window.open(`/api/export?batchId=${selectedBatchId()}`, "_blank");
  };

  const totalPortions = () => {
    return productionList().reduce((acc, item) => acc + (Number(item.totalQty) || 0), 0);
  };

  return (
    <AdminLayout title="Daftar Rekap Produksi">
      <div class="space-y-6">
        {/* Controls Header */}
        <div class="card-surface p-4 bg-white border border-[#E8E8EC] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 print:hidden">
          <div class="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
            <span class="text-xs font-semibold text-[#0A0A0A] shrink-0">Pilih Gelombang PO:</span>
            <div class="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={selectedBatchId() ?? ""}
                onChange={(e) => {
                  const id = Number(e.currentTarget.value);
                  setSelectedBatchId(id);
                  fetchSummary(id);
                }}
                class="input-base text-xs py-1.5 px-3 flex-1 sm:w-auto"
              >
                <For each={batches()}>
                  {(b) => <option value={b.id}>{b.code} — {b.title}</option>}
                </For>
              </select>

              <button
                type="button"
                onClick={() => selectedBatchId() && fetchSummary(selectedBatchId()!)}
                class="btn-secondary btn-sm p-2 shrink-0"
                title="Muat Ulang"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          <div class="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleExportCSV}
              class="btn-secondary btn-sm flex items-center justify-center gap-1.5 cursor-pointer text-xs"
            >
              <Download size={14} />
              <span>Ekspor CSV</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              class="btn-primary btn-sm flex items-center justify-center gap-1.5 cursor-pointer text-xs"
            >
              <Printer size={14} />
              <span>Cetak Rekap</span>
            </button>
          </div>
        </div>

        {/* Printable Paper Card */}
        <div class="card-surface p-8 bg-white border border-[#E8E8EC] space-y-6 print:border-none print:shadow-none print:p-0">
          <div class="border-b border-[#E8E8EC] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 class="font-heading font-bold text-xl sm:text-2xl text-[#0A0A0A]">
                Rekap Kebutuhan Produksi
              </h2>
              <span class="text-xs text-[#6B6B6B] block mt-0.5">
                Dihitung dari seluruh pesanan berstatus Dikonfirmasi, Diproduksi, atau Siap Diambil.
              </span>
            </div>

            <div class="sm:text-right">
              <span class="text-[11px] sm:text-xs font-mono text-[#9C9C9C] block">TOTAL PORSI WAJIB DIMASAK</span>
              <span class="font-heading font-bold text-2xl sm:text-3xl text-[#6366F1]">
                {totalPortions()} porsi
              </span>
            </div>
          </div>

          {/* Table */}
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs sm:text-sm min-w-[500px]">
              <thead class="bg-[#FAFAFA] text-[#6B6B6B] border-b border-[#E8E8EC] font-mono uppercase">
                <tr>
                  <th class="p-3 w-12 text-center">No</th>
                  <th class="p-3">Nama Varian Menu</th>
                  <th class="p-3 text-center">Jumlah Pemesan</th>
                  <th class="p-3 text-right">Total Kuantitas Porsi</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#E8E8EC]">
                <For
                  each={productionList()}
                  fallback={
                    <tr>
                      <td colspan={4} class="p-8 text-center text-[#9C9C9C]">
                        Belum ada pesanan yang dikonfirmasi untuk batch ini.
                      </td>
                    </tr>
                  }
                >
                  {(item, idx) => (
                    <tr class="hover:bg-[#FAFAFA]">
                      <td class="p-3 text-center font-mono text-[#6B6B6B]">
                        {idx() + 1}
                      </td>
                      <td class="p-3 font-semibold text-[#0A0A0A]">
                        {item.name}
                      </td>
                      <td class="p-3 text-center font-mono text-[#6B6B6B]">
                        {item.totalOrders} pesanan
                      </td>
                      <td class="p-3 text-right font-mono font-bold text-lg text-[#0A0A0A]">
                        {item.totalQty} porsi
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>

          <div class="pt-6 border-t border-[#E8E8EC] text-xs text-[#9C9C9C] flex justify-between">
            <span>Mol-Mol Purwokerto • Produksi Bersih & Higienis</span>
            <span class="font-mono">Dicetak: {new Date().toLocaleString("id-ID")}</span>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
