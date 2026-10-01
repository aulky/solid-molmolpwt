import { A } from "@solidjs/router";
import { ArrowLeft } from "lucide-solid";

export default function NotFound() {
  return (
    <main class="min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-4 bg-[#FAFAFA]">
      <div class="max-w-sm w-full bg-white border border-[#E8E8EC] rounded-2xl p-8 text-center shadow-xs space-y-5">
        <div class="space-y-1">
          <h1 class="text-4xl font-extrabold tracking-tight text-[#0A0A0A] font-mono">
            404
          </h1>
          <p class="text-sm font-semibold text-[#6B6B6B] uppercase tracking-wider">
            Not Found
          </p>
        </div>

        <A
          href="/"
          class="inline-flex items-center justify-center gap-2 w-full px-5 py-2.5 rounded-xl bg-[#6366F1] hover:bg-[#4F46E5] text-white text-xs sm:text-sm font-semibold shadow-xs transition active:scale-[0.98]"
        >
          <ArrowLeft size={16} />
          <span>Kembali ke Beranda</span>
        </A>
      </div>
    </main>
  );
}
