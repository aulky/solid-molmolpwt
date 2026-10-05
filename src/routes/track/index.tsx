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
    <div class="min-h-[80vh] flex flex-col justify-center items-center px-4 sm:px-6 py-8 sm:py-12 bg-[#FFF4DE]">
      <div class="w-full max-w-md card-surface p-6 sm:p-8 bg-[#FFFDF8] border border-[#E7D8C3] rounded-2xl space-y-5 sm:space-y-6 shadow-xs">
        <div class="text-center space-y-2">
          <div class="w-12 h-12 rounded-full bg-[#D92D3A]/10 text-[#D92D3A] flex items-center justify-center mx-auto">
            <Search size={24} />
          </div>
          <h1 class="font-heading font-bold text-2xl text-[#5B4638]">
            Lacak Pesanan Pre-Order
          </h1>
          <p class="text-xs sm:text-sm text-[#806B5C] leading-relaxed">
            Periksa status verifikasi pembayaran, proses produksi pesanan, dan jadwal pengiriman Anda.
          </p>
        </div>

        <form onSubmit={handleSearch} class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-[#5B4638] mb-1">
              Kode Pesanan atau Order ID <span class="text-[#D92D3A]">*</span>
            </label>
            <input
              type="text"
              required
              value={queryInput()}
              onInput={(e) => setQueryInput(e.currentTarget.value)}
              placeholder="Contoh: MM-7K2P4Q atau Order ID"
              class="input-base uppercase font-semibold text-xs tracking-wider"
            />
            <span class="text-[11px] text-[#806B5C] block mt-1">
              Diterbitkan di layar konfirmasi saat Anda berhasil checkout.
            </span>
          </div>

          <Show when={errorMsg()}>
            <div class="p-3 rounded-xl bg-[#FFF5F5] border border-[#FECDD3] text-xs text-[#D92D3A] flex items-center gap-1.5">
              <AlertCircle size={14} class="shrink-0" />
              <span>{errorMsg()}</span>
            </div>
          </Show>

          <button
            type="submit"
            class="btn-primary w-full flex items-center justify-center gap-2 h-11 cursor-pointer"
          >
            <Search size={16} />
            <span>Cari Status Pesanan</span>
          </button>
        </form>

        <div class="pt-4 border-t border-[#E7D8C3] text-center">
          <span class="text-xs text-[#806B5C]">
            Lupa kode pesanan Anda? Silakan hubungi admin via WhatsApp.
          </span>
        </div>
      </div>
    </div>
  );
}
