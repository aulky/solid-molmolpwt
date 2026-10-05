import { createSignal, onMount, Show, For } from "solid-js";
import { AdminLayout } from "~/components/admin/AdminLayout";
import {
  Save,
  Loader2,
  CheckCircle2,
  QrCode,
  Plus,
  Trash2,
  MapPin,
  Navigation,
  ExternalLink,
} from "lucide-solid";

interface BankAccountRow {
  bankName: string;
  bankAccountNo: string;
  bankAccountName: string;
}

export default function AdminSettingsPage() {
  const [storeName, setStoreName] = createSignal("");
  const [storeTagline, setStoreTagline] = createSignal("");
  const [pickupAddress, setPickupAddress] = createSignal("");
  const [pickupLatitude, setPickupLatitude] = createSignal<string | number>("");
  const [pickupLongitude, setPickupLongitude] = createSignal<string | number>("");
  const [pickupMapsUrl, setPickupMapsUrl] = createSignal("");
  const [isDetectingGps, setIsDetectingGps] = createSignal(false);
  const [bankAccounts, setBankAccounts] = createSignal<BankAccountRow[]>([
    { bankName: "BCA", bankAccountNo: "", bankAccountName: "" },
  ]);
  const [qrisImagePath, setQrisImagePath] = createSignal("");
  const [flatDeliveryFee, setFlatDeliveryFee] = createSignal(10000);
  const [freeDeliveryMin, setFreeDeliveryMin] = createSignal(75000);
  const [allowDelivery, setAllowDelivery] = createSignal(true);
  const [allowCod, setAllowCod] = createSignal(true);
  const [announcementText, setAnnouncementText] = createSignal("");
  const [announcementActive, setAnnouncementActive] = createSignal(false);
  const [adminPhone, setAdminPhone] = createSignal("");
  const [adminTelegramChatId, setAdminTelegramChatId] = createSignal("");
  const [trackRequirePhone, setTrackRequirePhone] = createSignal(false);

  const [isLoading, setIsLoading] = createSignal(false);
  const [isSaving, setIsSaving] = createSignal(false);
  const [successMsg, setSuccessMsg] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);

  const fetchSettings = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/settings", { credentials: "include" });
      const data = await res.json();
      if (data) {
        setStoreName(data.storeName || "");
        setStoreTagline(data.storeTagline || "");
        setPickupAddress(data.pickupAddress || "");
        setPickupLatitude(
          data.pickupLatitude !== null && data.pickupLatitude !== undefined
            ? data.pickupLatitude
            : ""
        );
        setPickupLongitude(
          data.pickupLongitude !== null && data.pickupLongitude !== undefined
            ? data.pickupLongitude
            : ""
        );
        setPickupMapsUrl(data.pickupMapsUrl || "");
        if (Array.isArray(data.bankAccounts) && data.bankAccounts.length > 0) {
          setBankAccounts(data.bankAccounts);
        } else if (data.bankAccountNo) {
          setBankAccounts([
            {
              bankName: data.bankName || "BCA",
              bankAccountNo: data.bankAccountNo || "",
              bankAccountName: data.bankAccountName || "",
            },
          ]);
        }
        setQrisImagePath(data.qrisImagePath || "");
        setFlatDeliveryFee(data.flatDeliveryFee ?? 10000);
        setFreeDeliveryMin(data.freeDeliveryMin ?? 75000);
        setAllowDelivery(Boolean(data.allowDelivery));
        setAllowCod(Boolean(data.allowCod));
        setAnnouncementText(data.announcementText || "");
        setAnnouncementActive(Boolean(data.announcementActive));
        setAdminPhone(data.adminPhone || "");
        setAdminTelegramChatId(data.adminTelegramChatId || "");
        setTrackRequirePhone(Boolean(data.trackRequirePhone));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  onMount(() => {
    fetchSettings();
  });

  const addBankAccount = () => {
    setBankAccounts([
      ...bankAccounts(),
      { bankName: "BCA", bankAccountNo: "", bankAccountName: storeName() || "Mol-Mol Purwokerto" },
    ]);
  };

  const removeBankAccount = (index: number) => {
    if (bankAccounts().length <= 1) {
      setErrorMessage("Minimal harus ada 1 rekening bank toko.");
      return;
    }
    setBankAccounts(bankAccounts().filter((_, i) => i !== index));
  };

  const updateBankAccount = (index: number, field: keyof BankAccountRow, val: string) => {
    const list = [...bankAccounts()];
    list[index] = { ...list[index], [field]: val };
    setBankAccounts(list);
  };

  const handleQrisUpload = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    if (file.size > 4 * 1024 * 1024) {
      setErrorMessage("Ukuran barcode QRIS maksimal 4 MB.");
      input.value = "";
      return;
    }

    setErrorMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "settings");

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setQrisImagePath(data.path);
      } else {
        setErrorMessage(data.error || "Gagal mengunggah foto QRIS.");
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Terjadi kesalahan saat mengunggah foto QRIS.");
      console.error("QRIS upload error:", err);
    }
  };

  const handleGetAdminGps = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setErrorMessage("Browser tidak mendukung geolokasi GPS.");
      return;
    }

    setIsDetectingGps(true);
    setErrorMessage(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(7));
        const lng = Number(pos.coords.longitude.toFixed(7));
        setPickupLatitude(lat);
        setPickupLongitude(lng);
        setPickupMapsUrl(`https://maps.google.com/?q=${lat},${lng}`);

        // Otomatis reverse-geocode dan perbarui alamat pickup yang sesuai
        try {
          const res = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
          if (res.ok) {
            const data = await res.json();
            const addr = data.formattedAddress || data.displayName;
            if (addr) {
              setPickupAddress(addr);
            }
          }
        } catch (err) {
          console.warn("Reverse geocode error:", err);
        } finally {
          setIsDetectingGps(false);
        }
      },
      (err) => {
        setIsDetectingGps(false);
        setErrorMessage(`Gagal mengambil titik GPS: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSave = async (e: Event) => {
    e.preventDefault();
    setIsSaving(true);
    setSuccessMsg(false);

    try {
      const validBankAccounts = bankAccounts().map((b) => ({
        bankName: b.bankName.trim(),
        bankAccountNo: b.bankAccountNo.trim(),
        bankAccountName: b.bankAccountName.trim(),
      }));

      const primaryBank = validBankAccounts[0] || {
        bankName: "BCA",
        bankAccountNo: "",
        bankAccountName: "",
      };

      const payload = {
        storeName: storeName().trim(),
        storeTagline: storeTagline().trim(),
        pickupAddress: pickupAddress().trim() || null,
        pickupLatitude: pickupLatitude() !== "" ? Number(pickupLatitude()) : null,
        pickupLongitude: pickupLongitude() !== "" ? Number(pickupLongitude()) : null,
        pickupMapsUrl: pickupMapsUrl().trim() || null,
        bankName: primaryBank.bankName,
        bankAccountNo: primaryBank.bankAccountNo,
        bankAccountName: primaryBank.bankAccountName,
        bankAccounts: validBankAccounts,
        qrisImagePath: qrisImagePath().trim() || null,
        flatDeliveryFee: Number(flatDeliveryFee()),
        freeDeliveryMin: freeDeliveryMin() ? Number(freeDeliveryMin()) : null,
        allowDelivery: allowDelivery(),
        allowCod: allowCod(),
        announcementText: announcementText().trim() || null,
        announcementActive: announcementActive(),
        adminPhone: adminPhone().trim(),
        adminTelegramChatId: adminTelegramChatId().trim() || null,
        trackRequirePhone: trackRequirePhone(),
      };

      const res = await fetch("/api/admin/settings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gagal menyimpan pengaturan");
      }

      setErrorMessage(null);
      setSuccessMsg(true);
      setTimeout(() => setSuccessMsg(false), 3000);
    } catch (err: any) {
      setErrorMessage(err?.message || "Terjadi kesalahan saat menyimpan pengaturan");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminLayout title="Pengaturan Toko CMS">
      <div class="space-y-6 max-w-3xl">
        <Show when={errorMessage()}>
          <div class="p-3.5 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/20 flex items-center justify-between text-xs text-[#EF4444]">
            <span>{errorMessage()}</span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              class="font-semibold underline cursor-pointer text-[11px]"
            >
              Tutup
            </button>
          </div>
        </Show>

        <form onSubmit={handleSave} class="space-y-6">
        {/* Identitas Toko */}
        <div class="card-surface p-6 bg-[#FFFDF9] border border-[#E8DFD5] rounded-2xl space-y-4 shadow-xs">
          <h3 class="font-heading font-bold text-base text-[#1C1917] pb-2 border-b border-[#E8DFD5]">
            Identitas Toko & Kontak
          </h3>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label class="block font-semibold text-[#1C1917] mb-1">Nama Toko</label>
              <input
                type="text"
                required
                value={storeName()}
                onInput={(e) => setStoreName(e.currentTarget.value)}
                class="input-base text-xs"
              />
            </div>

            <div>
              <label class="block font-semibold text-[#1C1917] mb-1">Nomor WhatsApp Admin</label>
              <input
                type="text"
                required
                value={adminPhone()}
                onInput={(e) => setAdminPhone(e.currentTarget.value)}
                placeholder="628xxxxxxxxxx"
                class="input-base text-xs font-medium"
              />
            </div>

            <div class="sm:col-span-2">
              <label class="block font-semibold text-[#1C1917] mb-1">Tagline Toko</label>
              <input
                type="text"
                value={storeTagline()}
                onInput={(e) => setStoreTagline(e.currentTarget.value)}
                class="input-base text-xs"
              />
            </div>
          </div>
        </div>

        {/* Alamat & Titik Koordinat Pengambilan (Pickup) */}
        <div class="card-surface p-4 sm:p-6 bg-[#FFFDF9] border border-[#E8DFD5] rounded-2xl space-y-4 shadow-xs">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E8DFD5]">
            <div>
              <h3 class="font-heading font-bold text-base text-[#1C1917]">
                Alamat & Titik Koordinat Pengambilan (Pickup)
              </h3>
              <p class="text-xs text-[#6C5F57]">
                Tentukan alamat outlet toko tempat pembeli mengambil pesanan mandiri (Pickup).
              </p>
            </div>
            <button
              type="button"
              onClick={handleGetAdminGps}
              disabled={isDetectingGps()}
              class="btn-secondary btn-sm flex items-center justify-center gap-1.5 text-xs cursor-pointer w-full sm:w-auto shrink-0 h-9 px-3.5"
            >
              <Show when={isDetectingGps()} fallback={<Navigation size={13} />}>
                <Loader2 size={13} class="animate-spin" />
              </Show>
              <span>{isDetectingGps() ? "Mendeteksi..." : "Deteksi GPS Toko"}</span>
            </button>
          </div>

          <div class="space-y-3 text-xs">
            <div>
              <label class="block font-semibold text-[#1C1917] mb-1">
                Alamat Lengkap Outlet Pengambilan (Pickup)
              </label>
              <textarea
                rows={2}
                value={pickupAddress()}
                onInput={(e) => setPickupAddress(e.currentTarget.value)}
                placeholder="Contoh: Jl. Prof. Dr. Suharso No. 45, Arcawinangun, Purwokerto Timur"
                class="input-base text-xs"
              />
              <span class="text-[11px] text-[#6C5F57] block mt-1">
                Alamat ini akan ditampilkan kepada pembeli saat memilih metode Ambil di Tempat.
              </span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-semibold text-[#1C1917] mb-1">Latitude Titik Toko</label>
                <input
                  type="text"
                  value={pickupLatitude()}
                  onInput={(e) => {
                    setPickupLatitude(e.currentTarget.value);
                    if (e.currentTarget.value && pickupLongitude()) {
                      setPickupMapsUrl(`https://maps.google.com/?q=${e.currentTarget.value},${pickupLongitude()}`);
                    }
                  }}
                  placeholder="Contoh: -7.4243120"
                  class="input-base text-xs font-medium"
                />
              </div>

              <div>
                <label class="block font-semibold text-[#1C1917] mb-1">Longitude Titik Toko</label>
                <input
                  type="text"
                  value={pickupLongitude()}
                  onInput={(e) => {
                    setPickupLongitude(e.currentTarget.value);
                    if (pickupLatitude() && e.currentTarget.value) {
                      setPickupMapsUrl(`https://maps.google.com/?q=${pickupLatitude()},${e.currentTarget.value}`);
                    }
                  }}
                  placeholder="Contoh: 109.2486710"
                  class="input-base text-xs font-medium"
                />
              </div>
            </div>

            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="block font-semibold text-[#1C1917]">
                  Tautan Google Maps Titik Outlet
                </label>
                <Show when={pickupMapsUrl()}>
                  <a
                    href={pickupMapsUrl()}
                    target="_blank"
                    rel="noreferrer"
                    class="text-[#CE2738] hover:underline text-xs inline-flex items-center gap-1 font-medium"
                  >
                    <span>Uji Buka di Google Maps</span>
                    <ExternalLink size={12} />
                  </a>
                </Show>
              </div>
              <input
                type="text"
                value={pickupMapsUrl()}
                onInput={(e) => setPickupMapsUrl(e.currentTarget.value)}
                placeholder="https://maps.google.com/?q=-7.4243120,109.2486710"
                class="input-base text-xs font-medium"
              />
            </div>
          </div>
        </div>

        {/* Rekening & QRIS */}
        <div class="card-surface p-4 sm:p-6 bg-[#FFFDF9] border border-[#E8DFD5] rounded-2xl space-y-5 shadow-xs">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E8DFD5]">
            <div>
              <h3 class="font-heading font-bold text-base text-[#1C1917]">
                Pembayaran QRIS & Rekening Bank
              </h3>
              <p class="text-xs text-[#6C5F57]">
                Kelola daftar rekening bank tujuan transfer dan upload barcode QRIS toko.
              </p>
            </div>
            <button
              type="button"
              onClick={addBankAccount}
              class="btn-secondary btn-sm flex items-center justify-center gap-1.5 text-xs cursor-pointer w-full sm:w-auto shrink-0 h-9 px-3.5"
            >
              <Plus size={14} />
              <span>Tambah Rekening Bank</span>
            </button>
          </div>

          <div class="space-y-3">
            <span class="text-xs font-semibold text-[#1C1917] block">
              Daftar Nomor Rekening Aktif
            </span>
            <For each={bankAccounts()}>
              {(acc, idx) => (
                <div class="p-3.5 rounded-xl border border-[#E8DFD5] bg-[#FAF7F2] space-y-3">
                  <div class="flex items-center justify-between">
                    <span class="text-xs font-semibold text-[#CE2738] uppercase">
                      Rekening #{idx() + 1} {idx() === 0 ? "(Utama)" : ""}
                    </span>
                    <Show when={bankAccounts().length > 1}>
                      <button
                        type="button"
                        onClick={() => removeBankAccount(idx())}
                        class="text-[#CE2738] hover:opacity-80 text-xs flex items-center gap-1 cursor-pointer font-medium"
                        title="Hapus Rekening"
                      >
                        <Trash2 size={13} />
                        <span>Hapus</span>
                      </button>
                    </Show>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label class="block font-medium text-[#1C1917] mb-1">Nama Bank / E-Wallet</label>
                      <input
                        type="text"
                        required
                        value={acc.bankName}
                        onInput={(e) => updateBankAccount(idx(), "bankName", e.currentTarget.value)}
                        placeholder="Contoh: BCA / Mandiri / SeaBank"
                        class="input-base text-xs bg-white"
                      />
                    </div>

                    <div>
                      <label class="block font-medium text-[#1C1917] mb-1">Nomor Rekening</label>
                      <input
                        type="text"
                        required
                        value={acc.bankAccountNo}
                        onInput={(e) => updateBankAccount(idx(), "bankAccountNo", e.currentTarget.value)}
                        placeholder="Contoh: 0461234567"
                        class="input-base text-xs font-medium bg-white"
                      />
                    </div>

                    <div>
                      <label class="block font-medium text-[#1C1917] mb-1">Atas Nama Rekening</label>
                      <input
                        type="text"
                        required
                        value={acc.bankAccountName}
                        onInput={(e) => updateBankAccount(idx(), "bankAccountName", e.currentTarget.value)}
                        placeholder="Contoh: Mol-Mol Purwokerto"
                        class="input-base text-xs bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}
            </For>
          </div>

          <div class="pt-3 border-t border-[#E8DFD5] text-xs space-y-2">
            <label class="block font-semibold text-[#1C1917]">
              Foto Barcode QRIS Resmi Toko
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleQrisUpload}
              class="text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-full file:border-0 file:text-xs file:bg-[#CE2738]/10 file:text-[#CE2738] cursor-pointer"
            />
            <Show when={qrisImagePath()}>
              <div class="mt-2 flex items-center gap-3 p-2 bg-[#FAF7F2] rounded-xl border border-[#E8DFD5] w-fit">
                <img
                  src={qrisImagePath()}
                  alt="QRIS Toko"
                  class="w-32 h-auto rounded-lg border border-[#E8DFD5] bg-white object-contain"
                />
                <button
                  type="button"
                  onClick={() => setQrisImagePath("")}
                  class="btn-destructive btn-sm text-[11px] h-7"
                >
                  Hapus QRIS
                </button>
              </div>
            </Show>
          </div>
        </div>

        {/* Pengiriman & Ongkir */}
        <div class="card-surface p-6 bg-[#FFFDF9] border border-[#E8DFD5] rounded-2xl space-y-4 shadow-xs">
          <h3 class="font-heading font-bold text-base text-[#1C1917] pb-2 border-b border-[#E8DFD5]">
            Ketentuan Pengiriman & Tarif
          </h3>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label class="block font-semibold text-[#1C1917] mb-1">Ongkir Flat Standar (Rp)</label>
              <input
                type="number"
                min={0}
                required
                value={flatDeliveryFee()}
                onInput={(e) => setFlatDeliveryFee(Number(e.currentTarget.value))}
                class="input-base text-xs font-medium"
              />
            </div>

            <div>
              <label class="block font-semibold text-[#1C1917] mb-1">Minimal Belanja Gratis Ongkir (Rp)</label>
              <input
                type="number"
                min={0}
                value={freeDeliveryMin()}
                onInput={(e) => setFreeDeliveryMin(Number(e.currentTarget.value))}
                class="input-base text-xs font-medium"
              />
            </div>
          </div>

          <div class="flex flex-wrap gap-6 pt-2 text-xs">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allowDelivery()}
                onChange={(e) => setAllowDelivery(e.currentTarget.checked)}
                class="rounded text-[#CE2738] focus:ring-0"
              />
              <span class="font-medium text-[#1C1917]">Aktifkan Layanan Antar Kurir</span>
            </label>

            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allowCod()}
                onChange={(e) => setAllowCod(e.currentTarget.checked)}
                class="rounded text-[#CE2738] focus:ring-0"
              />
              <span class="font-medium text-[#1C1917]">Aktifkan Layanan COD (Bayar di Tempat)</span>
            </label>
          </div>
        </div>

        {/* Banner Pengumuman & Telegram */}
        <div class="card-surface p-6 bg-[#FFFDF9] border border-[#E8DFD5] rounded-2xl space-y-4 shadow-xs">
          <h3 class="font-heading font-bold text-base text-[#1C1917] pb-2 border-b border-[#E8DFD5]">
            Pengumuman & Notifikasi Bot Telegram
          </h3>

          <div class="space-y-3 text-xs">
            <div>
              <label class="block font-semibold text-[#1C1917] mb-1">
                Teks Pengumuman Promo / Info Batch PO
              </label>
              <input
                type="text"
                value={announcementText()}
                onInput={(e) => setAnnouncementText(e.currentTarget.value)}
                placeholder="Contoh: Pre-Order Batch Oktober telah dibuka! Kuota terbatas."
                class="input-base text-xs"
              />
            </div>

            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={announcementActive()}
                onChange={(e) => setAnnouncementActive(e.currentTarget.checked)}
                class="rounded text-[#CE2738] focus:ring-0"
              />
              <span class="font-medium text-[#1C1917]">Tampilkan Banner Pengumuman di Halaman Depan</span>
            </label>

            <div class="pt-2">
              <label class="block font-semibold text-[#1C1917] mb-1">
                Telegram Chat ID Admin (Grup/Pribadi)
              </label>
              <input
                type="text"
                value={adminTelegramChatId()}
                onInput={(e) => setAdminTelegramChatId(e.currentTarget.value)}
                placeholder="Contoh: -100123456789 atau ID Chat"
                class="input-base text-xs font-medium"
              />
              <span class="text-[11px] text-[#6C5F57] block mt-1">
                Setiap order masuk akan otomatis dikirimkan ke Telegram ID ini.
              </span>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div class="flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            type="submit"
            disabled={isSaving()}
            class="btn-primary w-full sm:w-auto flex items-center justify-center gap-2 h-10 px-6 cursor-pointer"
          >
            <Show when={isSaving()} fallback={<Save size={16} />}>
              <Loader2 size={16} class="animate-spin" />
            </Show>
            <span>{isSaving() ? "Menyimpan Pengaturan..." : "Simpan Perubahan CMS"}</span>
          </button>

          <Show when={successMsg()}>
            <span class="text-xs font-medium text-[#10B981] flex items-center justify-center sm:justify-start gap-1">
              <CheckCircle2 size={15} />
              <span>Pengaturan berhasil disimpan!</span>
            </span>
          </Show>
        </div>
      </form>
      </div>
    </AdminLayout>
  );
}
