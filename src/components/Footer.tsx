import { MapPin, Phone, ShieldCheck } from "lucide-solid";
import { A } from "@solidjs/router";

interface FooterProps {
  adminPhone?: string | null;
}

export function Footer(props: FooterProps) {
  const phone = () => props.adminPhone || "081234567890";

  return (
    <footer class="bg-[#2C221E] border-t border-[#42342D] py-12 mt-16 text-[#D8CBC0] text-xs">
      <div class="max-w-6xl mx-auto px-4 grid grid-cols-1 sm:grid-cols-3 gap-8">
        {/* 1. Brand & Social Media */}
        <div class="space-y-3">
          <div class="flex items-center gap-2.5">
            <img
              src="/molmol-logo.jpg"
              alt="Logo Mol-Mol"
              class="w-8 h-8 rounded-full object-cover border border-[#E8DFD5]/40 shadow-xs"
            />
            <h5 class="font-heading font-bold text-base text-[#FFFDF9]">
              Mol-Mol Purwokerto
            </h5>
          </div>
          <p class="leading-relaxed text-[#D8CBC0]">
            Dessert & Cemilan Purwokerto manis dan gurih dengan resep otentik, higienis, dan cita rasa premium.
          </p>
          <div class="pt-1 flex items-center gap-2">
            <a
              href="https://www.instagram.com/molmol.purwokerto/"
              target="_blank"
              rel="noopener noreferrer"
              class="w-8 h-8 rounded-full bg-[#3C302A] border border-[#4F4037] flex items-center justify-center text-[#E1306C] hover:bg-[#E1306C] hover:text-white hover:border-[#E1306C] transition shadow-2xs cursor-pointer"
              title="Instagram @molmol.purwokerto"
              aria-label="Instagram @molmol.purwokerto"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
            </a>

            <a
              href="https://www.threads.com/@molmol.purwokerto"
              target="_blank"
              rel="noopener noreferrer"
              class="w-8 h-8 rounded-full bg-[#3C302A] border border-[#4F4037] flex items-center justify-center text-[#FFFDF9] hover:bg-white hover:text-[#1C1917] hover:border-white transition shadow-2xs cursor-pointer"
              title="Threads @molmol.purwokerto"
              aria-label="Threads @molmol.purwokerto"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                <path d="M18.263 11.097c-.03-3.486-1.92-5.586-5.111-5.586-2.13 0-3.922.963-4.863 2.499l2.062 1.438c.535-.843 1.272-1.543 2.628-1.543 1.528 0 2.318.85 2.544 2.431a15 15 0 0 0-2.236-.173c-4.125 0-6.068 1.867-6.068 4.336s1.943 3.99 4.804 3.99c3.139 0 5.013-2.115 5.781-4.735.798.361 1.348 1.204 1.348 2.47 0 3.387-3.907 5.232-7.22 5.232-4.885 0-8.077-3.207-8.077-8.424 0-6.392 4.223-10.487 9.9-10.487 3.808 0 5.69 1.671 6.97 3.914l2.108-1.475C21.44 2.078 18.331 0 13.663 0 6.227 0 1.168 5.277 1.168 12.934c0 7 4.953 11.066 10.856 11.066 4.878 0 9.809-2.846 9.809-7.716 0-2.545-1.46-4.231-3.569-5.187m-6.33 4.855c-1.077 0-2.026-.512-2.026-1.453 0-1.483 1.822-1.934 3.606-1.934.678 0 1.34.045 1.927.173-.422 1.927-1.671 3.215-3.508 3.214Z" />
              </svg>
            </a>

            <a
              href="https://www.tiktok.com/@molmol.purwokerto"
              target="_blank"
              rel="noopener noreferrer"
              class="w-8 h-8 rounded-full bg-[#3C302A] border border-[#4F4037] flex items-center justify-center text-[#FFFDF9] hover:bg-[#000000] hover:text-[#00F2FE] hover:border-[#000000] transition shadow-2xs cursor-pointer"
              title="TikTok @molmol.purwokerto"
              aria-label="TikTok @molmol.purwokerto"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
              </svg>
            </a>
          </div>
        </div>

        {/* 2. Kontak & Layanan */}
        <div class="space-y-3">
          <h5 class="font-heading font-bold text-base text-[#FFFDF9]">
            Layanan & Operasional
          </h5>
          <div class="space-y-2 text-[#D8CBC0]">
            <div class="flex items-center gap-2">
              <MapPin size={15} class="text-[#CE2738] shrink-0" />
              <span>Purwokerto, Jawa Tengah</span>
            </div>
            <div class="flex items-center gap-2">
              <Phone size={15} class="text-[#CE2738] shrink-0" />
              <span>WhatsApp: {phone()}</span>
            </div>
          </div>
        </div>

        {/* 3. Ketentuan Pre-Order */}
        <div class="space-y-3">
          <h5 class="font-heading font-bold text-base text-[#FFFDF9]">
            Ketentuan Pre-Order
          </h5>
          <p class="leading-relaxed text-[#D8CBC0]">
            Pesanan diproduksi segar sesuai kuota gelombang PO. Bukti pembayaran wajib diunggah untuk konfirmasi jadwal pengantaran.
          </p>
        </div>
      </div>

      <div class="max-w-6xl mx-auto px-4 mt-10 pt-4 border-t border-[#42342D] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#A8988C]">
        <div class="flex items-center gap-3">
          <span>© 2026 Mol-Mol Purwokerto. Semua hak cipta dilindungi.</span>
          <span>•</span>
          <A href="/terms" class="hover:text-[#CE2738] underline transition">Syarat & Kebijakan PO</A>
        </div>
        <A href="/admin" class="hover:text-[#CE2738] flex items-center gap-1 transition">
          <ShieldCheck size={13} />
          <span>Login Admin</span>
        </A>
      </div>
    </footer>
  );
}
