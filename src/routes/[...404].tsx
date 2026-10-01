import { A } from "@solidjs/router";
import { Package, Search, Home, ArrowLeft } from "lucide-solid";
import { Badge } from "~/components/ui/Badge";

export default function NotFound() {
  return (
    <main class="min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-4 sm:p-6 bg-[#FAFAFA]">
      <div class="max-w-md w-full bg-white border border-[#E8E8EC] rounded-2xl p-6 sm:p-8 text-center shadow-xs">
        <div class="flex justify-center mb-4">
          <Badge variant="error" class="px-3 py-1 font-mono text-xs">
            HTTP 404 • Not Found
          </Badge>
        </div>

        <div class="w-16 h-16 mx-auto mb-5 rounded-2xl bg-[#6366F1]/10 border border-[#6366F1]/20 flex items-center justify-center text-[#6366F1]">
          <Package size={32} strokeWidth={1.75} />
        </div>

        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-[#0A0A0A] mb-2 font-display">
          Halaman Tidak Ditemukan
        </h1>

        <p class="text-sm text-[#6B6B6B] leading-relaxed mb-6 font-body">
          Maaf, halaman yang Anda tuju tidak ditemukan atau sudah dipindahkan. Yuk kembali pesan menu favorit Mol-Mol Purwokerto atau cek status pesanan Anda.
        </p>

        <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5">
          <A
            href="/"
            class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#6366F1] hover:bg-[#4F46E5] text-white text-sm font-semibold shadow-xs transition active:scale-[0.98]"
          >
            <ArrowLeft size={16} />
            <span>Kembali ke Beranda</span>
          </A>

          <A
            href="/track"
            class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#F4F4F5] hover:bg-[#E4E4E7] text-[#0A0A0A] text-sm font-medium transition active:scale-[0.98]"
          >
            <Search size={16} />
            <span>Lacak Pesanan</span>
          </A>
        </div>

        <div class="mt-8 pt-5 border-t border-[#E8E8EC]/80 flex items-center justify-center gap-2 text-xs text-[#9C9C9C]">
          <span>Mol-Mol Purwokerto</span>
          <span>•</span>
          <span>Authentic Homemade Treats</span>
        </div>
      </div>
    </main>
  );
}
