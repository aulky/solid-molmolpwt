import { createSignal, createMemo, Show, For } from "solid-js";
import { Modal } from "../ui/Modal";
import { GpsPicker, GpsLocationData } from "./GpsPicker";
import { PaymentProofUpload } from "./PaymentProofUpload";
import { calculateOrderPricing, formatRupiah } from "~/lib/pricing";
import { CatalogProduct } from "../catalog/ProductCard";
import { BatchInfo } from "../catalog/BatchHero";
import { StoreSettingsData } from "~/lib/services/settings";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  ShoppingBag,
  ArrowRight,
  AlertCircle,
  Loader2,
  Phone,
  MapPin,
} from "lucide-solid";

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  batch: BatchInfo;
  cartItems: Array<{ product: CatalogProduct; qty: number }>;
  storeSettings: StoreSettingsData;
  onSuccess: () => void;
}

export function CheckoutModal(props: CheckoutModalProps) {
  // Stepper state
  const [currentStep, setCurrentStep] = createSignal<1 | 2>(1);

  // Form signals
  const [customerName, setCustomerName] = createSignal("");
  const [customerPhone, setCustomerPhone] = createSignal("");
  const [customerTelegram, setCustomerTelegram] = createSignal("");
  const [fulfillment, setFulfillment] = createSignal<"pickup" | "delivery" | "cod">("pickup");
  const [addressText, setAddressText] = createSignal("");
  const [addressNote, setAddressNote] = createSignal("");
  const [paymentMethod, setPaymentMethod] = createSignal<"qris" | "transfer">("qris");
  const [paymentProofPath, setPaymentProofPath] = createSignal<string | null>(null);

  const [gpsData, setGpsData] = createSignal<GpsLocationData>({
    latitude: null,
    longitude: null,
    accuracyM: null,
    locationSource: "manual",
  });

  // State proses
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null);
  const [successOrder, setSuccessOrder] = createSignal<{
    orderId: string;
    shortCode: string;
    total: number;
    customerName: string;
  } | null>(null);
  const [copied, setCopied] = createSignal(false);

  // Kalkulasi harga murni
  const pricing = createMemo(() => {
    const items = props.cartItems.map((ci) => ({
      unitPrice: ci.product.effectivePrice,
      qty: ci.qty,
    }));

    return calculateOrderPricing({
      items,
      fulfillment: fulfillment(),
      flatDeliveryFee: props.batch.deliveryFeeFlat || props.storeSettings.flatDeliveryFee,
      freeDeliveryMin: props.batch.freeDeliveryMin ?? props.storeSettings.freeDeliveryMin,
    });
  });

  const handleCopyCode = (text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const goToStep2 = () => {
    setErrorMsg(null);
    if (!customerName().trim() || customerName().trim().length < 2) {
      setErrorMsg("Nama lengkap pemesan wajib diisi (minimal 2 karakter).");
      return;
    }
    if (!customerPhone().trim() || customerPhone().trim().length < 9) {
      setErrorMsg("Nomor WhatsApp aktif wajib diisi (minimal 9 digit).");
      return;
    }
    setCurrentStep(2);
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setErrorMsg(null);

    // Validasi dasar di client
    if (!customerName().trim() || customerName().trim().length < 2) {
      setCurrentStep(1);
      setErrorMsg("Nama lengkap pemesan wajib diisi (minimal 2 karakter).");
      return;
    }
    if (!customerPhone().trim() || customerPhone().trim().length < 9) {
      setCurrentStep(1);
      setErrorMsg("Nomor WhatsApp aktif wajib diisi.");
      return;
    }
    if (fulfillment() !== "pickup" && (!addressText().trim() || addressText().trim().length < 5)) {
      setErrorMsg("Alamat lengkap wajib diisi untuk layanan Antar / COD (minimal 5 karakter).");
      return;
    }
    if (fulfillment() !== "cod" && !paymentProofPath()) {
      setErrorMsg("Harap unggah bukti pembayaran transfer/QRIS terlebih dahulu.");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        batchId: props.batch.id,
        customerName: customerName().trim(),
        customerPhone: customerPhone().trim(),
        customerTelegram: customerTelegram().trim() || undefined,
        fulfillment: fulfillment(),
        addressText: fulfillment() !== "pickup" ? addressText().trim() : undefined,
        addressNote: addressNote().trim() || undefined,
        latitude: gpsData().latitude,
        longitude: gpsData().longitude,
        gpsAccuracyM: gpsData().accuracyM,
        locationSource: gpsData().locationSource,
        paymentMethod: paymentMethod(),
        paymentProofPath: paymentProofPath(),
        idempotencyKey: `ord-${props.batch.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        items: props.cartItems.map((ci) => ({
          batchItemId: ci.product.batchItemId,
          menuItemId: ci.product.menuItemId,
          qty: ci.qty,
        })),
      };

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gagal membuat pesanan.");
      }

      setSuccessOrder({
        orderId: data.orderId,
        shortCode: data.shortCode,
        total: data.total,
        customerName: data.customerName,
      });

      props.onSuccess();
    } catch (err: any) {
      setErrorMsg(err?.message || "Terjadi kesalahan saat checkout.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title={
        successOrder()
          ? "Pesanan Berhasil Dikirim!"
          : currentStep() === 1
          ? "Checkout Pre-Order • Step 1: Data Pemesan"
          : "Checkout Pre-Order • Step 2: Pengiriman & Pembayaran"
      }
      maxWidth="max-w-xl"
    >
      <Show
        when={!successOrder()}
        fallback={
          /* SUCCESS STATE */
          <div class="py-4 space-y-5 text-center">
            <div class="w-16 h-16 bg-[#10B981]/15 text-[#10B981] rounded-full flex items-center justify-center mx-auto mb-2">
              <CheckCircle2 size={36} />
            </div>

            <div>
              <h4 class="font-heading font-bold text-xl text-[#0A0A0A]">
                Terima Kasih, {successOrder()?.customerName}!
              </h4>
              <p class="text-xs sm:text-sm text-[#6B6B6B] mt-1">
                Pesanan Pre-Order Anda telah tersimpan dan sedang menunggu verifikasi admin.
              </p>
            </div>

            {/* Kode Pesanan Box */}
            <div class="p-4 bg-[#FAFAFA] border border-[#E8E8EC] rounded-xl text-left space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-xs font-mono text-[#6B6B6B] uppercase tracking-wider">
                  Kode Pesanan (Short Code):
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyCode(successOrder()!.shortCode)}
                  class="text-xs text-[#6366F1] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Copy size={12} />
                  <span>{copied() ? "Tersalin!" : "Salin"}</span>
                </button>
              </div>

              <div class="text-2xl font-mono font-bold text-[#0A0A0A]">
                {successOrder()?.shortCode}
              </div>

              <div class="text-[11px] font-mono text-[#9C9C9C] break-all pt-1 border-t border-[#E8E8EC]">
                Order ID UUID: {successOrder()?.orderId}
              </div>
            </div>

            <div class="flex flex-col sm:flex-row gap-2.5 pt-2">
              <a
                href={`/track/${successOrder()?.shortCode}`}
                class="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                <span>Buka Status Tracking</span>
                <ArrowRight size={15} />
              </a>

              <a
                href={`https://wa.me/${props.storeSettings.adminPhone}?text=${encodeURIComponent(
                  `Halo Admin Mol-Mol, saya sudah submit pesanan dengan Kode ${successOrder()?.shortCode}. Mohon dicek ya.`
                )}`}
                target="_blank"
                rel="noreferrer"
                class="btn-secondary flex-1 flex items-center justify-center gap-2"
              >
                <Phone size={15} />
                <span>Hubungi Admin WA</span>
              </a>
            </div>
          </div>
        }
      >
        <form onSubmit={handleSubmit} class="space-y-4">
          {/* Stepper Header Bar */}
          <div class="flex items-center justify-between pb-3 border-b border-[#E8E8EC] text-xs">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              class={`flex items-center gap-2 font-medium cursor-pointer transition ${
                currentStep() === 1 ? "text-[#6366F1] font-semibold" : "text-[#10B981]"
              }`}
            >
              <span
                class={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  currentStep() === 1 ? "bg-[#6366F1] text-white" : "bg-[#10B981] text-white"
                }`}
              >
                1
              </span>
              <span>1. Data Pemesan</span>
            </button>

            <div class="h-0.5 flex-1 mx-3 bg-[#E8E8EC]">
              <div
                class={`h-full transition-all duration-300 ${
                  currentStep() === 2 ? "bg-[#6366F1]" : "bg-transparent"
                }`}
              />
            </div>

            <button
              type="button"
              onClick={goToStep2}
              class={`flex items-center gap-2 font-medium cursor-pointer transition ${
                currentStep() === 2 ? "text-[#6366F1] font-semibold" : "text-[#9C9C9C]"
              }`}
            >
              <span
                class={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  currentStep() === 2 ? "bg-[#6366F1] text-white" : "bg-[#E8E8EC] text-[#6B6B6B]"
                }`}
              >
                2
              </span>
              <span>2. Pengiriman & Pembayaran</span>
            </button>
          </div>

          {/* STEP 1: Data Lengkap Pemesan */}
          <Show when={currentStep() === 1}>
            <div class="space-y-4">
              {/* Ringkasan Item Pesanan */}
              <div class="p-3 bg-[#FAFAFA] rounded-xl border border-[#E8E8EC] space-y-2 max-h-40 overflow-y-auto">
                <div class="text-xs font-semibold text-[#0A0A0A] flex items-center justify-between pb-1 border-b border-[#E8E8EC]">
                  <div class="flex items-center gap-1.5">
                    <ShoppingBag size={14} class="text-[#6366F1]" />
                    <span>Daftar Menu ({props.cartItems.length} item)</span>
                  </div>
                  <span class="font-mono text-[11px] text-[#6366F1] font-bold">
                    Subtotal: {formatRupiah(pricing().subtotal)}
                  </span>
                </div>

                <For each={props.cartItems}>
                  {(ci) => (
                    <div class="flex items-center justify-between text-xs py-0.5">
                      <span class="text-[#0A0A0A] font-medium">
                        {ci.product.name} <span class="text-[#6B6B6B]">x{ci.qty}</span>
                      </span>
                      <span class="font-mono text-[#0A0A0A]">
                        {formatRupiah(ci.product.effectivePrice * ci.qty)}
                      </span>
                    </div>
                  )}
                </For>
              </div>

              {/* Form Input Data Pemesan */}
              <div class="space-y-3">
                <div>
                  <label class="block text-xs font-semibold text-[#0A0A0A] mb-1">
                    Nama Lengkap Pemesan <span class="text-[#EF4444]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={customerName()}
                    onInput={(e) => setCustomerName(e.currentTarget.value)}
                    placeholder="Contoh: Budi Santoso"
                    class="input-base text-xs"
                  />
                </div>

                <div>
                  <label class="block text-xs font-semibold text-[#0A0A0A] mb-1">
                    Nomor WhatsApp Aktif <span class="text-[#EF4444]">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={customerPhone()}
                    onInput={(e) => setCustomerPhone(e.currentTarget.value)}
                    placeholder="Contoh: 081234567890"
                    class="input-base text-xs font-mono"
                  />
                  <span class="text-[11px] text-[#6B6B6B] block mt-1">
                    Tim Mol-Mol akan mengirimkan konfirmasi pesanan ke nomor WhatsApp ini.
                  </span>
                </div>

                <div>
                  <label class="block text-xs font-semibold text-[#0A0A0A] mb-1">
                    Username Telegram (Opsional)
                  </label>
                  <input
                    type="text"
                    value={customerTelegram()}
                    onInput={(e) => setCustomerTelegram(e.currentTarget.value)}
                    placeholder="@username (opsional)"
                    class="input-base text-xs font-mono"
                  />
                  <span class="text-[11px] text-[#6B6B6B] block mt-1">
                    Opsional untuk menerima notifikasi otomatis langsung di bot Telegram.
                  </span>
                </div>
              </div>

              {/* Error Alert */}
              <Show when={errorMsg()}>
                <div class="p-3 rounded-lg bg-[#FFF5F5] border border-[#FCA5A5] text-xs text-[#EF4444] flex items-start gap-2">
                  <AlertCircle size={15} class="shrink-0 mt-0.5" />
                  <span>{errorMsg()}</span>
                </div>
              </Show>

              {/* Step 1 Actions */}
              <div class="flex items-center justify-between gap-2 pt-2 border-t border-[#E8E8EC]">
                <button
                  type="button"
                  onClick={props.onClose}
                  class="btn-secondary btn-sm"
                >
                  Batal
                </button>

                <button
                  type="button"
                  onClick={goToStep2}
                  class="btn-primary btn-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Lanjut Pembayaran</span>
                  <span class="hidden sm:inline">& Pengiriman</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </Show>

          {/* STEP 2: Pengiriman, Pembayaran, QRIS & Bukti */}
          <Show when={currentStep() === 2}>
            <div class="space-y-4">
              {/* Metode Pengantaran */}
              <div class="space-y-2">
                <label class="block text-xs font-semibold text-[#0A0A0A]">
                  Pilih Metode Pengambilan / Pengiriman <span class="text-[#EF4444]">*</span>
                </label>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <label
                    class={`p-3 rounded-lg border text-xs cursor-pointer flex flex-col justify-between transition ${
                      fulfillment() === "pickup"
                        ? "border-[#6366F1] bg-[#6366F1]/5 text-[#6366F1] font-semibold"
                        : "border-[#E8E8EC] bg-white text-[#0A0A0A] hover:bg-[#FAFAFA]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="fulfillment"
                      value="pickup"
                      checked={fulfillment() === "pickup"}
                      onChange={() => setFulfillment("pickup")}
                      class="sr-only"
                    />
                    <span>Ambil di Tempat</span>
                    <span class="text-[11px] font-normal text-[#6B6B6B] mt-1">
                      Gratis • Jam {props.batch.pickupStart || "13:00"} - {props.batch.pickupEnd || "17:00"} WIB
                    </span>
                  </label>

                  <Show when={props.batch.allowDelivery}>
                    <label
                      class={`p-3 rounded-lg border text-xs cursor-pointer flex flex-col justify-between transition ${
                        fulfillment() === "delivery"
                          ? "border-[#6366F1] bg-[#6366F1]/5 text-[#6366F1] font-semibold"
                          : "border-[#E8E8EC] bg-white text-[#0A0A0A] hover:bg-[#FAFAFA]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="fulfillment"
                        value="delivery"
                        checked={fulfillment() === "delivery"}
                        onChange={() => setFulfillment("delivery")}
                        class="sr-only"
                      />
                      <span>Diantar Kurir</span>
                      <span class="text-[11px] font-normal text-[#6B6B6B] mt-1">
                        Area Purwokerto & Sekitarnya
                      </span>
                    </label>
                  </Show>

                  <Show when={props.batch.allowCod}>
                    <label
                      class={`p-3 rounded-lg border text-xs cursor-pointer flex flex-col justify-between transition ${
                        fulfillment() === "cod"
                          ? "border-[#6366F1] bg-[#6366F1]/5 text-[#6366F1] font-semibold"
                          : "border-[#E8E8EC] bg-white text-[#0A0A0A] hover:bg-[#FAFAFA]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="fulfillment"
                        value="cod"
                        checked={fulfillment() === "cod"}
                        onChange={() => setFulfillment("cod")}
                        class="sr-only"
                      />
                      <span>COD (Bayar di Tempat)</span>
                      <span class="text-[11px] font-normal text-[#6B6B6B] mt-1">
                        Bayar saat kurir tiba
                      </span>
                    </label>
                  </Show>
                </div>
              </div>

              {/* Info Titik Pengambilan Mandiri bila Pickup */}
              <Show when={fulfillment() === "pickup"}>
                <div class="p-3.5 rounded-lg border border-[#E8E8EC] bg-[#FAFAFA] space-y-1.5 text-xs">
                  <div class="flex items-center gap-1.5 font-semibold text-[#0A0A0A]">
                    <MapPin size={15} class="text-[#6366F1]" />
                    <span>Lokasi Pengambilan Mandiri (Outlet Toko):</span>
                  </div>
                  <p class="text-[#0A0A0A] font-medium leading-relaxed pl-5">
                    {props.storeSettings.pickupAddress ||
                      "Jl. Prof. Dr. Suharso No. 45, Arcawinangun, Purwokerto Timur"}
                  </p>
                  <Show
                    when={
                      props.storeSettings.pickupMapsUrl ||
                      (props.storeSettings.pickupLatitude && props.storeSettings.pickupLongitude)
                    }
                  >
                    <div class="pl-5 pt-0.5">
                      <a
                        href={
                          props.storeSettings.pickupMapsUrl ||
                          `https://maps.google.com/?q=${props.storeSettings.pickupLatitude},${props.storeSettings.pickupLongitude}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        class="text-[#6366F1] hover:underline inline-flex items-center gap-1 font-mono text-[11px]"
                      >
                        <span>Buka Titik Outlet di Google Maps</span>
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </Show>
                </div>
              </Show>

              {/* Form Alamat & GPS bila Delivery / COD */}
              <Show when={fulfillment() !== "pickup"}>
                <div class="space-y-3 pt-1">
                  <div>
                    <label class="block text-xs font-semibold text-[#0A0A0A] mb-1">
                      Alamat Lengkap Pengiriman <span class="text-[#EF4444]">*</span>
                    </label>
                    <textarea
                      required
                      rows={2}
                      value={addressText()}
                      onInput={(e) => setAddressText(e.currentTarget.value)}
                      placeholder="Nama jalan, RT/RW, nomor rumah, kelurahan/kecamatan..."
                      class="input-base text-xs"
                    />
                  </div>

                  <div>
                    <label class="block text-xs font-semibold text-[#0A0A0A] mb-1">
                      Patokan / Catatan Alamat (Opsional)
                    </label>
                    <input
                      type="text"
                      value={addressNote()}
                      onInput={(e) => setAddressNote(e.currentTarget.value)}
                      placeholder="Contoh: Pagar hitam depan masjid, rumah cat hijau"
                      class="input-base text-xs"
                    />
                  </div>

                  {/* Komponen Deteksi GPS Presisi */}
                  <GpsPicker
                    location={gpsData()}
                    onChange={(loc) => setGpsData(loc)}
                    onAddressResolved={(addr) => setAddressText(addr)}
                  />
                </div>
              </Show>

              {/* Metode Pembayaran & Upload Bukti (kecuali COD) */}
              <Show when={fulfillment() !== "cod"}>
                <div class="space-y-3 pt-1">
                  <label class="block text-xs font-semibold text-[#0A0A0A]">
                    Pilihan Pembayaran <span class="text-[#EF4444]">*</span>
                  </label>

                  <div class="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("qris")}
                      class={`p-2.5 rounded-lg border text-xs font-medium cursor-pointer transition ${
                        paymentMethod() === "qris"
                          ? "border-[#6366F1] bg-[#6366F1]/10 text-[#6366F1]"
                          : "border-[#E8E8EC] bg-white text-[#0A0A0A]"
                      }`}
                    >
                      QRIS (Scan All Bank / E-Wallet)
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod("transfer")}
                      class={`p-2.5 rounded-lg border text-xs font-medium cursor-pointer transition ${
                        paymentMethod() === "transfer"
                          ? "border-[#6366F1] bg-[#6366F1]/10 text-[#6366F1]"
                          : "border-[#E8E8EC] bg-white text-[#0A0A0A]"
                      }`}
                    >
                      Transfer Bank ({props.storeSettings.bankName || "BCA"})
                    </button>
                  </div>

                  <PaymentProofUpload
                    totalAmount={pricing().total}
                    paymentMethod={paymentMethod()}
                    bankInfo={{
                      name: props.storeSettings.bankName,
                      accountNo: props.storeSettings.bankAccountNo,
                      accountName: props.storeSettings.bankAccountName,
                    }}
                    bankAccounts={props.storeSettings.bankAccounts}
                    qrisImagePath={props.storeSettings.qrisImagePath}
                    uploadedPath={paymentProofPath()}
                    onUploaded={(p) => setPaymentProofPath(p)}
                  />
                </div>
              </Show>

              {/* Rincian Subtotal & Total Pembayaran */}
              <div class="p-3 bg-[#FAFAFA] rounded-xl border border-[#E8E8EC] space-y-1.5 text-xs">
                <div class="flex justify-between text-[#6B6B6B]">
                  <span>Subtotal Menu:</span>
                  <span class="font-mono text-[#0A0A0A] font-semibold">
                    {formatRupiah(pricing().subtotal)}
                  </span>
                </div>

                <div class="flex justify-between text-[#6B6B6B]">
                  <span>Ongkos Kirim:</span>
                  <span class="font-mono text-[#0A0A0A]">
                    <Show when={pricing().isFreeDelivery} fallback={formatRupiah(pricing().deliveryFee)}>
                      <span class="text-[#20970B] font-semibold">GRATIS</span>
                    </Show>
                  </span>
                </div>

                <div class="flex justify-between text-sm font-bold text-[#0A0A0A] pt-2 border-t border-[#E8E8EC]">
                  <span>Total Tagihan:</span>
                  <span class="font-mono text-[#6366F1] text-base">
                    {formatRupiah(pricing().total)}
                  </span>
                </div>
              </div>

              {/* Error Alert */}
              <Show when={errorMsg()}>
                <div class="p-3 rounded-lg bg-[#FFF5F5] border border-[#FCA5A5] text-xs text-[#EF4444] flex items-start gap-2">
                  <AlertCircle size={15} class="shrink-0 mt-0.5" />
                  <span>{errorMsg()}</span>
                </div>
              </Show>

              {/* Step 2 Actions */}
              <div class="flex items-center justify-between gap-2 pt-2 border-t border-[#E8E8EC]">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  disabled={isSubmitting()}
                  class="btn-secondary btn-sm"
                >
                  <span>← Kembali</span>
                  <span class="hidden sm:inline">ke Data Pemesan</span>
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting()}
                  class="btn-primary btn-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Show when={isSubmitting()} fallback={<span>Kirim Pesanan Pre-Order</span>}>
                    <Loader2 size={15} class="animate-spin" />
                    <span>Memproses...</span>
                  </Show>
                </button>
              </div>
            </div>
          </Show>
        </form>
      </Show>
    </Modal>
  );
}
