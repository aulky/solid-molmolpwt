import { A } from "@solidjs/router";
import { ArrowLeft, ShieldCheck, Clock, Truck, AlertCircle, FileText } from "lucide-solid";

export default function TermsPage() {
  return (
    <div class="min-h-screen bg-[#FAF7F2] py-8 px-4 sm:px-6 text-[#1C1917]">
      <div class="max-w-3xl mx-auto space-y-6">
        {/* Back Link */}
        <A
          href="/"
          class="text-xs sm:text-sm font-medium text-[#6C5F57] hover:text-[#1C1917] flex items-center gap-1.5 transition"
        >
          <ArrowLeft size={16} />
          <span>Kembali ke Pre-Order</span>
        </A>

        {/* Main Document Card */}
        <div class="card-surface p-6 sm:p-10 bg-[#FFFDF9] border border-[#E8DFD5] rounded-2xl space-y-6 sm:space-y-8 shadow-xs">
          <div class="border-b border-[#E8DFD5] pb-6 space-y-2">
            <h1 class="font-heading font-bold text-xl sm:text-3xl text-[#1C1917]">
              Syarat, Ketentuan & Kebijakan Pre-Order
            </h1>
            <p class="text-xs sm:text-sm text-[#6C5F57]">
              Berlaku untuk seluruh transaksi pemesanan di platform resmi UMKM Mol-Mol Purwokerto.
            </p>
          </div>

          {/* Section 1 */}
          <div class="space-y-3">
            <h3 class="font-heading font-bold text-base sm:text-lg flex items-center gap-2">
              <Clock size={18} class="text-[#CE2738]" />
              <span>1. Sistem Pre-Order (PO) & Kuota Produksi</span>
            </h3>
            <p class="text-xs sm:text-sm text-[#6C5F57] leading-relaxed">
              Mol-Mol Purwokerto menerapkan sistem produksi terjadwal berdasarkan gelombang PO (batch). Hal ini bertujuan untuk memastikan setiap porsi camilan dibuat dari bahan-bahan segar, tanpa pengawet buatan, dan disajikan dengan kerenyahan optimal. Setiap batch memiliki kuota pesanan terbatas yang akan ditutup otomatis ketika kuota telah terpenuhi atau batas waktu penutupan PO telah terlewati.
            </p>
          </div>

          {/* Section 2 */}
          <div class="space-y-3">
            <h3 class="font-heading font-bold text-base sm:text-lg flex items-center gap-2">
              <ShieldCheck size={18} class="text-[#1B872A]" />
              <span>2. Pembayaran & Bukti Transfer</span>
            </h3>
            <p class="text-xs sm:text-sm text-[#6C5F57] leading-relaxed">
              Pesanan baru akan diproses setelah pelanggan mengunggah foto bukti pembayaran yang sah (struk QRIS atau bukti transfer bank). Jika dalam kurun waktu verifikasi bukti transfer dinyatakan tidak valid atau palsu, admin berhak menolak pesanan dan kuota akan otomatis dikembalikan ke sistem.
            </p>
          </div>

          {/* Section 3 */}
          <div class="space-y-3">
            <h3 class="font-heading font-bold text-base sm:text-lg flex items-center gap-2">
              <Truck size={18} class="text-[#CE2738]" />
              <span>3. Pengambilan Mandiri & Pengantaran Kurir</span>
            </h3>
            <ul class="text-xs sm:text-sm text-[#6C5F57] space-y-2 list-disc pl-5 leading-relaxed">
              <li>
                <b>Ambil di Tempat (Pickup):</b> Pelanggan dapat mengambil langsung di outlet resmi Mol-Mol Purwokerto sesuai jam operasional pengambilan (13:00 - 17:00 WIB) pada tanggal pengiriman yang ditentukan.
              </li>
              <li>
                <b>Diantar Kurir:</b> Pengantaran menjangkau wilayah Purwokerto dan sekitarnya. Pelanggan wajib mencantumkan alamat lengkap serta menyertakan titik koordinat GPS demi ketepatan rute kurir.
              </li>
              <li>
                <b>COD (Bayar di Tempat):</b> Pembayaran dilakukan secara tunai kepada kurir saat pesanan diserahterimakan.
              </li>
            </ul>
          </div>

          {/* Section 4 */}
          <div class="space-y-3">
            <h3 class="font-heading font-bold text-base sm:text-lg flex items-center gap-2">
              <AlertCircle size={18} class="text-[#CE2738]" />
              <span>4. Kebijakan Pembatalan & Pengembalian Dana</span>
            </h3>
            <p class="text-xs sm:text-sm text-[#6C5F57] leading-relaxed">
              Pembatalan pesanan oleh pelanggan hanya dapat dilakukan sebelum status pesanan berubah menjadi <b>Sedang Diproduksi</b>. Setelah proses produksi dimulai, pesanan tidak dapat dibatalkan atau ditarik kembali. Bila terjadi kendala operasional dari pihak toko, dana akan dikembalikan utuh (100%) ke rekening pemesan.
            </p>
          </div>

          <div class="pt-6 border-t border-[#E8DFD5] flex flex-wrap items-center justify-between text-xs text-[#8D7E73]">
            <span>Mol-Mol Purwokerto • Dessert & Cemilan Purwokerto</span>
            <span>Pembaruan Terakhir: Oktober 2026</span>
          </div>
        </div>
      </div>
    </div>
  );
}
