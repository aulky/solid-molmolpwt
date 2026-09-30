import { createSignal, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Search, Package, ShieldCheck, AlertCircle } from "lucide-solid";

export default function TrackSearchPage() {
  const navigate = useNavigate();
  const [queryInput, setQueryInput] = createSignal("");
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null);

  const handleSearch = (e: Event) => {
    e.preventDefault();
    const q = queryInput().trim();
    if (!q || q.length < 5) {
      setErrorMsg("Masukkan Kode Pesanan (MM-XXXXXX) atau UUID pesanan Anda.");
      return;
    }

    const url = `/track/${encodeURIComponent(q.toUpperCase())}`;
    navigate(url);
  };

  return (
    <div class="min-h-[80vh] flex flex-col justify-center items-center px-4 sm:px-6 py-8 sm:py-12">
      <div class="w-full max-w-md card-surface p-5 sm:p-8 bg-white border border-[#E8E8EC] space-y-5 sm:space-y-6">
        <div class="text-center space-y-2">
          <div class="w-12 h-12 rounded-xl bg-[#6366F1]/10 text-[#6366F1] flex items-center justify-center mx-auto">
            <Search size={24} />
          </div>
          <h1 class="font-heading font-bold text-2xl text-[#0A0A0A]">
            Lacak Pesanan Pre-Order
          </h1>
          <p class="text-xs sm:text-sm text-[#6B6B6B] leading-relaxed">
            Periksa status verifikasi pembayaran, proses produksi pesanan, dan jadwal pengiriman Anda.
          </p>
        </div>

        <form onSubmit={handleSearch} class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-[#0A0A0A] mb-1">
              Kode Pesanan atau Order ID UUID <span class="text-[#EF4444]">*</span>
            </label>
            <input
              type="text"
              required
              value={queryInput()}
              onInput={(e) => setQueryInput(e.currentTarget.value)}
              placeholder="Contoh: MM-7K2P4Q atau UUID"
              class="input-base font-mono uppercase"
            />
            <span class="text-[11px] text-[#6B6B6B] block mt-1">
              Diterbitkan di layar konfirmasi saat Anda berhasil checkout.
            </span>
          </div>

          <Show when={errorMsg()}>
            <div class="p-3 rounded-lg bg-[#FFF5F5] border border-[#FCA5A5] text-xs text-[#EF4444] flex items-center gap-1.5">
              <AlertCircle size={14} class="shrink-0" />
              <span>{errorMsg()}</span>
            </div>
          </Show>

          <button
            type="submit"
            class="btn-primary w-full flex items-center justify-center gap-2 h-10 cursor-pointer"
          >
            <Search size={16} />
            <span>Cari Status Pesanan</span>
          </button>
        </form>

        <div class="pt-4 border-t border-[#E8E8EC] text-center">
          <span class="text-xs text-[#9C9C9C]">
            Lupa kode pesanan Anda? Silakan hubungi admin via WhatsApp.
          </span>
        </div>
      </div>
    </div>
  );
}
