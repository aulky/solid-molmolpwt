import { createSignal, Show, For } from "solid-js";
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  QrCode,
  Building2,
  Wallet,
  Copy,
  Check,
} from "lucide-solid";
import { formatRupiah } from "~/lib/pricing";

export interface PaymentChannel {
  id: string;
  name: string;
  accountNo: string;
  accountName: string;
  type: "bank" | "ewallet";
}

interface PaymentProofUploadProps {
  totalAmount: number;
  paymentMethod: "qris" | "transfer";
  bankInfo: {
    name: string;
    accountNo: string;
    accountName: string;
  };
  bankAccounts?: Array<{ bankName: string; bankAccountNo: string; bankAccountName: string }> | null;
  qrisImagePath?: string | null;
  uploadedPath: string | null;
  onUploaded: (path: string) => void;
}

export function PaymentProofUpload(props: PaymentProofUploadProps) {
  const [isUploading, setIsUploading] = createSignal(false);
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null);
  const [copiedId, setCopiedId] = createSignal<string | null>(null);
  const [localPreview, setLocalPreview] = createSignal<string | null>(null);

  // Daftar opsi pembayaran transfer & e-wallet
  const channels = (): PaymentChannel[] => {
    if (props.bankAccounts && props.bankAccounts.length > 0) {
      return props.bankAccounts.map((b, i) => ({
        id: `bank-${i}`,
        name: b.bankName || "Bank",
        accountNo: b.bankAccountNo || "",
        accountName: b.bankAccountName || "Mol-Mol Purwokerto",
        type: "bank" as const,
      }));
    }

    return [
      {
        id: "bca",
        name: props.bankInfo.name || "BCA",
        accountNo: props.bankInfo.accountNo || "0461234567",
        accountName: props.bankInfo.accountName || "Mol-Mol Purwokerto",
        type: "bank",
      },
    ];
  };

  const [selectedChannelId, setSelectedChannelId] = createSignal("");

  const currentChannel = () => {
    const list = channels();
    return list.find((c) => c.id === selectedChannelId()) || list[0];
  };

  const handleCopy = (text: string, id: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleFileChange = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    if (file.size > 4 * 1024 * 1024) {
      setErrorMsg("Ukuran file maksimal 4 MB.");
      return;
    }

    // Tampilkan pratinjau lokal instan
    try {
      const objUrl = URL.createObjectURL(file);
      setLocalPreview(objUrl);
    } catch {}

    setIsUploading(true);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "proofs");

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Gagal mengunggah bukti transfer.");
      }

      props.onUploaded(data.path);
    } catch (err: any) {
      setErrorMsg(err?.message || "Terjadi kesalahan saat mengunggah foto.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div class="space-y-4">
      {/* Detail Pembayaran Toko */}
      <div class="p-4 rounded-2xl border border-[#E8DFD5] bg-[#FAF7F2] space-y-3">
        <div class="flex items-center justify-between pb-2 border-b border-[#E8DFD5]">
          <span class="text-xs text-[#6C5F57] uppercase tracking-wider font-semibold">
            Total Harus Dibayar
          </span>
          <span class="text-lg font-bold font-heading text-[#CE2738]">
            {formatRupiah(props.totalAmount)}
          </span>
        </div>

        {/* QRIS Channel */}
        <Show when={props.paymentMethod === "qris"}>
          <div class="space-y-3">
            <div class="flex items-center gap-2 text-xs font-semibold text-[#1C1917]">
              <QrCode size={16} class="text-[#CE2738]" />
              <span>Scan QRIS Resmi Toko Mol-Mol Purwokerto</span>
            </div>

            <div class="flex justify-center p-3 bg-[#FFFDF9] rounded-xl border border-[#E8DFD5]">
              <Show
                when={props.qrisImagePath}
                fallback={
                  <div class="w-48 h-48 bg-[#F3ECE2] border border-dashed border-[#E8DFD5] rounded-xl flex flex-col items-center justify-center p-4 text-center">
                    <QrCode size={48} class="text-[#CE2738] mb-2 opacity-80" />
                    <span class="text-xs font-semibold text-[#1C1917]">QRIS Mol-Mol</span>
                    <span class="text-[10px] text-[#6C5F57] mt-0.5">Semua Bank & E-Wallet</span>
                  </div>
                }
              >
                <img
                  src={props.qrisImagePath!}
                  alt="QRIS Mol-Mol Purwokerto"
                  class="max-w-[200px] h-auto object-contain rounded-md"
                />
              </Show>
            </div>
            <p class="text-[11px] text-[#6C5F57] text-center">
              Dapat dibayar menggunakan BCA, Mandiri, BRI, BNI, Dana, GoPay, OVO, ShopeePay, dan LinkAja.
            </p>
          </div>
        </Show>

        {/* Transfer Bank & E-Wallet Channels */}
        <Show when={props.paymentMethod === "transfer"}>
          <div class="space-y-3">
            <span class="text-xs font-semibold text-[#1C1917] block">
              Pilih Tujuan Transfer / Saldo:
            </span>

            {/* Channel Tabs */}
            <div class="grid grid-cols-2 gap-1.5">
              <For each={channels()}>
                {(ch) => (
                  <button
                    type="button"
                    onClick={() => setSelectedChannelId(ch.id)}
                    class={`p-2.5 rounded-xl border text-left text-xs transition cursor-pointer flex items-center gap-2 ${
                      selectedChannelId() === ch.id
                        ? "border-[#CE2738] bg-[#CE2738]/10 text-[#CE2738] font-semibold"
                        : "border-[#E8DFD5] bg-[#FFFDF9] text-[#1C1917] hover:bg-[#F3ECE2]"
                    }`}
                  >
                    <Show
                      when={ch.type === "bank"}
                      fallback={<Wallet size={14} class="shrink-0" />}
                    >
                      <Building2 size={14} class="shrink-0" />
                    </Show>
                    <span class="truncate">{ch.name}</span>
                  </button>
                )}
              </For>
            </div>

            {/* Selected Account Box */}
            <div class="p-3 bg-[#FFFDF9] rounded-xl border border-[#E8DFD5] text-xs space-y-1.5">
              <div class="flex justify-between py-1 border-b border-[#E8DFD5]/60">
                <span class="text-[#6C5F57]">Tujuan:</span>
                <span class="font-semibold text-[#1C1917]">{currentChannel().name}</span>
              </div>

              <div class="flex items-center justify-between py-1 border-b border-[#E8DFD5]/60">
                <div>
                  <span class="text-[#6C5F57] block">Nomor Rekening / Saldo:</span>
                  <span class="font-heading font-bold text-[#CE2738] text-sm select-all">
                    {currentChannel().accountNo}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleCopy(currentChannel().accountNo, currentChannel().id)}
                  class="btn-secondary btn-sm text-[11px] h-7 px-2.5 flex items-center gap-1 cursor-pointer"
                  title="Salin Nomor"
                >
                  <Show
                    when={copiedId() === currentChannel().id}
                    fallback={
                      <>
                        <Copy size={12} />
                        <span>Salin</span>
                      </>
                    }
                  >
                    <Check size={12} class="text-[#1B872A]" />
                    <span class="text-[#1B872A]">Tersalin</span>
                  </Show>
                </button>
              </div>

              <div class="flex justify-between py-1">
                <span class="text-[#6C5F57]">Atas Nama:</span>
                <span class="font-medium text-[#1C1917]">{currentChannel().accountName}</span>
              </div>
            </div>
          </div>
        </Show>
      </div>

      {/* Upload Bukti Bayar Box */}
      <div class="space-y-2">
        <label class="block text-xs font-semibold text-[#1C1917]">
          Unggah Foto Bukti Transfer / Struk QRIS <span class="text-[#CE2738]">*</span>
        </label>

        <div class="relative border-2 border-dashed border-[#E8DFD5] hover:border-[#CE2738] rounded-2xl p-4 text-center bg-[#FFFDF9] transition cursor-pointer">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            disabled={isUploading()}
            class="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />

          <Show
            when={!localPreview() && !props.uploadedPath}
            fallback={
              <div class="flex flex-col items-center py-2">
                <CheckCircle2 size={30} class="text-[#1B872A] mb-1.5" />
                <span class="text-xs font-semibold text-[#1C1917]">
                  Bukti Pembayaran Terunggah
                </span>
                <span class="text-[11px] text-[#6C5F57] mt-0.5">
                  Klik untuk mengganti foto lain jika salah
                </span>
                <img
                  src={localPreview() || props.uploadedPath!}
                  alt="Preview Bukti"
                  class="mt-3 max-h-36 rounded-xl border border-[#E8DFD5] object-contain shadow-xs bg-[#FFFDF9]"
                />
              </div>
            }
          >
            <div class="flex flex-col items-center py-3">
              <Show
                when={isUploading()}
                fallback={
                  <>
                    <UploadCloud size={30} class="text-[#CE2738] mb-2" />
                    <span class="text-xs font-semibold text-[#1C1917]">
                      Pilih atau Seret Foto Bukti Pembayaran
                    </span>
                    <span class="text-[11px] text-[#6C5F57] mt-0.5">
                      Format JPG, PNG, atau WebP (Maksimal 4 MB)
                    </span>
                  </>
                }
              >
                <Loader2 size={30} class="text-[#CE2738] animate-spin mb-2" />
                <span class="text-xs font-semibold text-[#1C1917]">Mengunggah foto...</span>
              </Show>
            </div>
          </Show>
        </div>

        <Show when={errorMsg()}>
          <div class="text-xs text-[#CE2738] flex items-center gap-1.5 mt-1">
            <AlertCircle size={13} />
            <span>{errorMsg()}</span>
          </div>
        </Show>
      </div>
    </div>
  );
}
