import { A } from "@solidjs/router";
import { ArrowLeft } from "lucide-solid";

export default function NotFound() {
  return (
    <main class="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-[#FAF7F2]">
      <div class="max-w-sm w-full bg-[#FFFDF9] border border-[#E8DFD5] rounded-2xl p-8 text-center shadow-xs space-y-6">
        <div class="space-y-1.5">
          <h1 class="text-5xl font-extrabold tracking-tight text-[#CE2738] font-heading">
            404
          </h1>
          <p class="text-sm font-semibold text-[#1C1917] uppercase tracking-wider">
            Not Found
          </p>
          <p class="text-xs text-[#6C5F57]">
            Halaman yang Anda tuju tidak ditemukan atau telah dipindahkan.
          </p>
        </div>

        <A
          href="/"
          class="inline-flex items-center justify-center gap-2 w-full px-5 py-3 rounded-full bg-[#CE2738] hover:bg-[#B51F2F] text-white text-xs sm:text-sm font-semibold shadow-xs transition active:scale-[0.98]"
        >
          <ArrowLeft size={16} />
          <span>Kembali ke Beranda</span>
        </A>
      </div>
    </main>
  );
}
