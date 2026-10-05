import { A } from "@solidjs/router";
import { ArrowLeft } from "lucide-solid";

export default function NotFound() {
  return (
    <main class="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-[#FFF4DE]">
      <div class="max-w-sm w-full bg-[#FFFDF8] border border-[#E7D8C3] rounded-2xl p-8 text-center shadow-xs space-y-6">
        <div class="space-y-1.5">
          <h1 class="text-5xl font-extrabold tracking-tight text-[#D92D3A] font-heading">
            404
          </h1>
          <p class="text-sm font-semibold text-[#5B4638] uppercase tracking-wider">
            Not Found
          </p>
          <p class="text-xs text-[#806B5C]">
            Halaman yang Anda tuju tidak ditemukan atau telah dipindahkan.
          </p>
        </div>

        <A
          href="/"
          class="inline-flex items-center justify-center gap-2 w-full px-5 py-3 rounded-full bg-[#D92D3A] hover:bg-[#B92230] text-[#FFFDF8] text-xs sm:text-sm font-semibold shadow-xs transition active:scale-[0.98]"
        >
          <ArrowLeft size={16} />
          <span>Kembali ke Beranda</span>
        </A>
      </div>
    </main>
  );
}
