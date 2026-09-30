import { createSignal, onMount, For, Show } from "solid-js";
import { AdminLayout } from "~/components/admin/AdminLayout";
import { Badge } from "~/components/ui/Badge";
import { Modal } from "~/components/ui/Modal";
import { formatTanggalWIB, formatRupiah } from "~/lib/pricing";
import {
  Plus,
  Calendar,
  Clock,
  Layers,
  Loader2,
  Check,
  Edit3,
  MapPin,
  Navigation,
  ExternalLink,
} from "lucide-solid";

export default function AdminBatchesPage() {
  const [batches, setBatches] = createSignal<any[]>([]);
  const [isModalOpen, setIsModalOpen] = createSignal(false);
  const [editingBatchId, setEditingBatchId] = createSignal<number | null>(null);
  const [isLoading, setIsLoading] = createSignal(false);
  const [isSubmitting, setIsSubmitting] = createSignal(false);

  // Form signals
  const [code, setCode] = createSignal("");
  const [title, setTitle] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [orderOpenAt, setOrderOpenAt] = createSignal("");
  const [orderCloseAt, setOrderCloseAt] = createSignal("");
  const [deliveryDate, setDeliveryDate] = createSignal("");
  const [quotaTotal, setQuotaTotal] = createSignal(50);
  const [deliveryFeeFlat, setDeliveryFeeFlat] = createSignal(10000);
  const [freeDeliveryMin, setFreeDeliveryMin] = createSignal(75000);
  const [status, setStatus] = createSignal<"open" | "draft" | "closed">("open");

  // Metode Pengambilan & Pengantaran yang Dibuka
  const [allowPickup, setAllowPickup] = createSignal(true);
  const [allowDelivery, setAllowDelivery] = createSignal(true);
  const [allowCod, setAllowCod] = createSignal(false);

  // Alamat & Koordinat Pengambilan Mandiri Batch
  const [pickupStart, setPickupStart] = createSignal("13:00");
  const [pickupEnd, setPickupEnd] = createSignal("17:00");
  const [pickupAddress, setPickupAddress] = createSignal("");
  const [pickupLatitude, setPickupLatitude] = createSignal<string | number>("");
  const [pickupLongitude, setPickupLongitude] = createSignal<string | number>("");
  const [pickupMapsUrl, setPickupMapsUrl] = createSignal("");
  const [isDetectingGps, setIsDetectingGps] = createSignal(false);

  const fetchBatches = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/batches", { credentials: "include" });
      const data = await res.json();
      setBatches(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  onMount(() => {
    fetchBatches();
  });

  const handleCopyStoreAddress = async () => {
    try {
      const res = await fetch("/api/admin/settings", { credentials: "include" });
      const data = await res.json();
      if (data) {
        if (data.pickupAddress) setPickupAddress(data.pickupAddress);
        if (data.pickupLatitude !== null && data.pickupLatitude !== undefined)
          setPickupLatitude(data.pickupLatitude);
        if (data.pickupLongitude !== null && data.pickupLongitude !== undefined)
          setPickupLongitude(data.pickupLongitude);
        if (data.pickupMapsUrl) setPickupMapsUrl(data.pickupMapsUrl);
      }
    } catch (e) {
      console.warn("Gagal menyalin alamat toko:", e);
    }
  };

  const handleGetBatchGps = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      alert("Browser tidak mendukung geolokasi GPS.");
      return;
    }
    setIsDetectingGps(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setIsDetectingGps(false);
        const lat = Number(pos.coords.latitude.toFixed(7));
        const lng = Number(pos.coords.longitude.toFixed(7));
        setPickupLatitude(lat);
        setPickupLongitude(lng);
        setPickupMapsUrl(`https://maps.google.com/?q=${lat},${lng}`);
        if (!pickupAddress() || pickupAddress().trim() === "") {
          try {
            const res = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
            if (res.ok) {
              const data = await res.json();
              if (data.formattedAddress) {
                setPickupAddress(data.formattedAddress);
              }
            }
          } catch {}
        }
      },
      (err) => {
        setIsDetectingGps(false);
        alert(`Gagal mengambil titik GPS: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const openCreateModal = () => {
    const now = new Date();
    const open = now.toISOString().slice(0, 16);
    const close = new Date(now.getTime() + 4 * 24 * 3600 * 1000).toISOString().slice(0, 16);
    const deliv = new Date(now.getTime() + 6 * 24 * 3600 * 1000).toISOString().slice(0, 16);

    setEditingBatchId(null);
    setCode(`PO-${now.getFullYear()}-${now.getMonth() + 1}-A`);
    setTitle(`Batch Spesial PO ${now.toLocaleString("id-ID", { month: "long" })}`);
    setDescription("");
    setOrderOpenAt(open);
    setOrderCloseAt(close);
    setDeliveryDate(deliv);
    setQuotaTotal(50);
    setDeliveryFeeFlat(10000);
    setFreeDeliveryMin(75000);
    setStatus("open");
    setAllowPickup(true);
    setAllowDelivery(true);
    setAllowCod(false);
    setPickupStart("13:00");
    setPickupEnd("17:00");
    setPickupAddress("");
    setPickupLatitude("");
    setPickupLongitude("");
    setPickupMapsUrl("");
    handleCopyStoreAddress();
    setIsModalOpen(true);
  };

  const openEditModal = (b: any) => {
    setEditingBatchId(b.id);
    setCode(b.code || "");
    setTitle(b.title || "");
    setDescription(b.description || "");

    const toInputDate = (d: any) => {
      if (!d) return "";
      try {
        return new Date(d).toISOString().slice(0, 16);
      } catch {
        return "";
      }
    };

    setOrderOpenAt(toInputDate(b.orderOpenAt));
    setOrderCloseAt(toInputDate(b.orderCloseAt));
    setDeliveryDate(toInputDate(b.deliveryDate));
    setQuotaTotal(b.quotaTotal || 50);
    setDeliveryFeeFlat(b.deliveryFeeFlat ?? 10000);
    setFreeDeliveryMin(b.freeDeliveryMin ?? 75000);
    setStatus(b.status || "open");

    setAllowPickup(b.allowPickup !== undefined ? Boolean(b.allowPickup) : true);
    setAllowDelivery(b.allowDelivery !== undefined ? Boolean(b.allowDelivery) : true);
    setAllowCod(b.allowCod !== undefined ? Boolean(b.allowCod) : false);

    setPickupStart(b.pickupStart || "13:00");
    setPickupEnd(b.pickupEnd || "17:00");
    setPickupAddress(b.pickupAddress || "");
    setPickupLatitude(
      b.pickupLatitude !== null && b.pickupLatitude !== undefined ? b.pickupLatitude : ""
    );
    setPickupLongitude(
      b.pickupLongitude !== null && b.pickupLongitude !== undefined ? b.pickupLongitude : ""
    );
    setPickupMapsUrl(b.pickupMapsUrl || "");

    setIsModalOpen(true);
  };

  const handleSaveBatch = async (e: Event) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const payload: any = {
        code: code().trim(),
        title: title().trim(),
        description: description().trim(),
        orderOpenAt: orderOpenAt(),
        orderCloseAt: orderCloseAt(),
        deliveryDate: deliveryDate(),
        quotaTotal: Number(quotaTotal()),
        deliveryFeeFlat: Number(deliveryFeeFlat()),
        freeDeliveryMin: freeDeliveryMin() ? Number(freeDeliveryMin()) : null,
        status: status(),
        allowPickup: allowPickup(),
        allowDelivery: allowDelivery(),
        allowCod: allowCod(),
        pickupStart: pickupStart().trim() || "13:00",
        pickupEnd: pickupEnd().trim() || "17:00",
        pickupAddress: allowPickup() ? pickupAddress().trim() || null : null,
        pickupLatitude:
          allowPickup() && pickupLatitude() !== "" ? Number(pickupLatitude()) : null,
        pickupLongitude:
          allowPickup() && pickupLongitude() !== "" ? Number(pickupLongitude()) : null,
        pickupMapsUrl: allowPickup() ? pickupMapsUrl().trim() || null : null,
      };

      const isEdit = editingBatchId() !== null;
      if (isEdit) {
        payload.id = editingBatchId();
      }

      const res = await fetch("/api/admin/batches", {
        method: isEdit ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Gagal menyimpan batch");
        return;
      }

      setIsModalOpen(false);
      await fetchBatches();
    } catch (err: any) {
      alert(err?.message || "Terjadi kesalahan");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AdminLayout title="Manajemen Gelombang Pre-Order (Batch PO)">
      <div class="space-y-6">
        {/* Header Action */}
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p class="text-xs sm:text-sm text-[#6B6B6B]">
            Atur periode pembukaan PO, kuota maksimal pesanan, dan tanggal pengiriman.
          </p>

          <button
            type="button"
            onClick={openCreateModal}
            class="btn-primary btn-sm flex items-center justify-center gap-1.5 cursor-pointer w-full sm:w-auto shrink-0"
          >
            <Plus size={15} />
            <span>Buka Batch PO Baru</span>
          </button>
        </div>

        {/* Batch Cards Grid */}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <For
            each={batches()}
            fallback={
              <div class="col-span-2 card-surface p-8 text-center text-[#9C9C9C]">
                Belum ada batch PO. Klik tombol di atas untuk membuka batch baru.
              </div>
            }
          >
            {(b) => (
              <div class="card-surface p-5 bg-white border border-[#E8E8EC] space-y-4">
                <div class="flex items-center justify-between pb-3 border-b border-[#E8E8EC]">
                  <div>
                    <span class="text-xs font-mono font-bold text-[#6366F1] block">
                      {b.code}
                    </span>
                    <h3 class="font-heading font-bold text-base text-[#0A0A0A]">
                      {b.title}
                    </h3>
                  </div>

                  <Badge
                    variant={
                      b.status === "open"
                        ? "success"
                        : b.status === "closed"
                        ? "warning"
                        : "default"
                    }
                  >
                    {b.status.toUpperCase()}
                  </Badge>
                </div>

                <div class="space-y-1.5 text-xs text-[#6B6B6B]">
                  <div class="flex items-center justify-between">
                    <span class="flex items-center gap-1">
                      <Clock size={13} /> Tutup PO:
                    </span>
                    <span class="font-mono text-[#0A0A0A]">
                      {formatTanggalWIB(b.orderCloseAt)}
                    </span>
                  </div>

                  <div class="flex items-center justify-between">
                    <span class="flex items-center gap-1">
                      <Calendar size={13} /> Jadwal Kirim:
                    </span>
                    <span class="font-mono text-[#0A0A0A]">
                      {formatTanggalWIB(b.deliveryDate, { includeTime: false })}
                    </span>
                  </div>

                  <div class="flex items-center justify-between">
                    <span class="flex items-center gap-1">
                      <Layers size={13} /> Kuota Pesanan:
                    </span>
                    <span class="font-mono font-semibold text-[#0A0A0A]">
                      {b.quotaUsed} / {b.quotaTotal} slot
                    </span>
                  </div>
                </div>

                <div class="pt-3 border-t border-[#E8E8EC] flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B6B6B]">
                  <div class="space-x-1.5 sm:space-x-2 text-[11px] sm:text-xs">
                    <span>Ongkir: {formatRupiah(b.deliveryFeeFlat)}</span>
                    <span>• Min Gratis: {formatRupiah(b.freeDeliveryMin || 0)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => openEditModal(b)}
                    class="btn-secondary btn-sm text-[11px] h-7 px-2.5 flex items-center gap-1 cursor-pointer hover:text-[#6366F1] shrink-0"
                    title="Edit Batch PO"
                  >
                    <Edit3 size={12} />
                    <span>Edit Batch</span>
                  </button>
                </div>
              </div>
            )}
          </For>
        </div>

        {/* Modal Buat / Edit Batch */}
        <Modal
          isOpen={isModalOpen()}
          onClose={() => setIsModalOpen(false)}
          title={editingBatchId() ? "Edit Gelombang Batch PO" : "Buka Gelombang PO Baru"}
          maxWidth="max-w-lg"
        >
          <form onSubmit={handleSaveBatch} class="space-y-4 text-xs">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block font-semibold text-[#0A0A0A] mb-1">Kode Batch</label>
                <input
                  type="text"
                  required
                  value={code()}
                  onInput={(e) => setCode(e.currentTarget.value)}
                  placeholder="Contoh: PO-2026-10-B"
                  class="input-base text-xs font-mono uppercase"
                />
              </div>

              <div>
                <label class="block font-semibold text-[#0A0A0A] mb-1">Status Batch</label>
                <select
                  value={status()}
                  onChange={(e) => setStatus(e.currentTarget.value as any)}
                  class="input-base text-xs"
                >
                  <option value="open">OPEN (Dibuka untuk Pemesanan)</option>
                  <option value="draft">DRAFT (Belum Dibuka)</option>
                  <option value="closed">CLOSED (Ditutup)</option>
                  <option value="production">PRODUCTION (Proses Produksi)</option>
                  <option value="delivered">DELIVERED (Selesai Pengiriman)</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block font-semibold text-[#0A0A0A] mb-1">Judul Batch</label>
              <input
                type="text"
                required
                value={title()}
                onInput={(e) => setTitle(e.currentTarget.value)}
                placeholder="Contoh: Pre-Order Spesial Akhir Pekan"
                class="input-base text-xs"
              />
            </div>

            <div>
              <label class="block font-semibold text-[#0A0A0A] mb-1">Deskripsi Singkat</label>
              <textarea
                rows={2}
                value={description()}
                onInput={(e) => setDescription(e.currentTarget.value)}
                class="input-base text-xs"
              />
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-semibold text-[#0A0A0A] mb-1">Batas Tutup PO</label>
                <input
                  type="datetime-local"
                  required
                  value={orderCloseAt()}
                  onInput={(e) => setOrderCloseAt(e.currentTarget.value)}
                  class="input-base text-xs font-mono"
                />
              </div>

              <div>
                <label class="block font-semibold text-[#0A0A0A] mb-1">Tanggal Pengiriman</label>
                <input
                  type="datetime-local"
                  required
                  value={deliveryDate()}
                  onInput={(e) => setDeliveryDate(e.currentTarget.value)}
                  class="input-base text-xs font-mono"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="block font-semibold text-[#0A0A0A] mb-1">Total Kuota Slot</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={quotaTotal()}
                  onInput={(e) => setQuotaTotal(Number(e.currentTarget.value))}
                  class="input-base text-xs font-mono"
                />
              </div>

              <div>
                <label class="block font-semibold text-[#0A0A0A] mb-1">Ongkir Flat (Rp)</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={deliveryFeeFlat()}
                  onInput={(e) => setDeliveryFeeFlat(Number(e.currentTarget.value))}
                  class="input-base text-xs font-mono"
                />
              </div>

              <div>
                <label class="block font-semibold text-[#0A0A0A] mb-1">Min Gratis Ongkir</label>
                <input
                  type="number"
                  min={0}
                  value={freeDeliveryMin()}
                  onInput={(e) => setFreeDeliveryMin(Number(e.currentTarget.value))}
                  class="input-base text-xs font-mono"
                />
              </div>
            </div>

            {/* Pilihan Metode Pengambilan & Pengantaran Batch */}
            <div class="space-y-2 pt-2 border-t border-[#E8E8EC]">
              <label class="block font-semibold text-[#0A0A0A]">
                Metode Pengambilan & Pengantaran yang Dibuka untuk Batch Ini
              </label>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label class="flex items-center gap-2 p-2.5 rounded border border-[#E8E8EC] bg-[#FAFAFA] cursor-pointer hover:bg-white text-xs">
                  <input
                    type="checkbox"
                    checked={allowPickup()}
                    onChange={(e) => setAllowPickup(e.currentTarget.checked)}
                    class="rounded text-[#6366F1]"
                  />
                  <span class="font-medium text-[#0A0A0A]">Ambil di Tempat (Pickup)</span>
                </label>

                <label class="flex items-center gap-2 p-2.5 rounded border border-[#E8E8EC] bg-[#FAFAFA] cursor-pointer hover:bg-white text-xs">
                  <input
                    type="checkbox"
                    checked={allowDelivery()}
                    onChange={(e) => setAllowDelivery(e.currentTarget.checked)}
                    class="rounded text-[#6366F1]"
                  />
                  <span class="font-medium text-[#0A0A0A]">Diantar Kurir (Delivery)</span>
                </label>

                <label class="flex items-center gap-2 p-2.5 rounded border border-[#E8E8EC] bg-[#FAFAFA] cursor-pointer hover:bg-white text-xs">
                  <input
                    type="checkbox"
                    checked={allowCod()}
                    onChange={(e) => setAllowCod(e.currentTarget.checked)}
                    class="rounded text-[#6366F1]"
                  />
                  <span class="font-medium text-[#0A0A0A]">Bayar di Tempat (COD)</span>
                </label>
              </div>
            </div>

            {/* Sub-form Pengambilan Mandiri bila Pickup Aktif */}
            <Show when={allowPickup()}>
              <div class="p-3.5 rounded-lg border border-[#6366F1]/30 bg-[#6366F1]/5 space-y-3">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#E8E8EC]">
                  <div class="flex items-center gap-1.5 font-bold text-xs text-[#0A0A0A]">
                    <MapPin size={14} class="text-[#6366F1]" />
                    <span>Titik & Alamat Pengambilan Batch Ini</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyStoreAddress}
                      class="text-[11px] text-[#6366F1] hover:underline font-medium cursor-pointer"
                      title="Salin alamat toko default"
                    >
                      Salin Alamat Toko
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={handleGetBatchGps}
                      disabled={isDetectingGps()}
                      class="text-[11px] text-[#6366F1] hover:underline font-medium cursor-pointer flex items-center gap-1"
                    >
                      <Navigation size={11} />
                      <span>{isDetectingGps() ? "Mendeteksi..." : "Deteksi GPS"}</span>
                    </button>
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block font-medium text-[#0A0A0A] mb-1">Jam Mulai Ambil</label>
                    <input
                      type="text"
                      value={pickupStart()}
                      onInput={(e) => setPickupStart(e.currentTarget.value)}
                      placeholder="13:00"
                      class="input-base text-xs font-mono bg-white"
                    />
                  </div>
                  <div>
                    <label class="block font-medium text-[#0A0A0A] mb-1">Jam Selesai Ambil</label>
                    <input
                      type="text"
                      value={pickupEnd()}
                      onInput={(e) => setPickupEnd(e.currentTarget.value)}
                      placeholder="17:00"
                      class="input-base text-xs font-mono bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label class="block font-medium text-[#0A0A0A] mb-1">
                    Alamat Lengkap Pengambilan
                  </label>
                  <textarea
                    rows={2}
                    value={pickupAddress()}
                    onInput={(e) => setPickupAddress(e.currentTarget.value)}
                    placeholder="Contoh: Jl. Prof. Dr. Suharso No. 45, Arcawinangun, Purwokerto Timur"
                    class="input-base text-xs bg-white"
                  />
                  <span class="text-[10px] text-[#6B6B6B] block mt-0.5">
                    Alamat ini akan ditampilkan di halaman Lacak Pesanan pembeli saat memilih metode Pickup.
                  </span>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label class="block font-medium text-[#0A0A0A] mb-1">Latitude</label>
                    <input
                      type="text"
                      value={pickupLatitude()}
                      onInput={(e) => {
                        setPickupLatitude(e.currentTarget.value);
                        if (e.currentTarget.value && pickupLongitude()) {
                          setPickupMapsUrl(
                            `https://maps.google.com/?q=${e.currentTarget.value},${pickupLongitude()}`
                          );
                        }
                      }}
                      placeholder="-7.4243120"
                      class="input-base text-xs font-mono bg-white"
                    />
                  </div>
                  <div>
                    <label class="block font-medium text-[#0A0A0A] mb-1">Longitude</label>
                    <input
                      type="text"
                      value={pickupLongitude()}
                      onInput={(e) => {
                        setPickupLongitude(e.currentTarget.value);
                        if (pickupLatitude() && e.currentTarget.value) {
                          setPickupMapsUrl(
                            `https://maps.google.com/?q=${pickupLatitude()},${e.currentTarget.value}`
                          );
                        }
                      }}
                      placeholder="109.2486710"
                      class="input-base text-xs font-mono bg-white"
                    />
                  </div>
                </div>

                <div>
                  <div class="flex items-center justify-between mb-1">
                    <label class="block font-medium text-[#0A0A0A]">
                      Tautan Google Maps Titik Pengambilan
                    </label>
                    <Show when={pickupMapsUrl()}>
                      <a
                        href={pickupMapsUrl()}
                        target="_blank"
                        rel="noreferrer"
                        class="text-[#6366F1] hover:underline text-[11px] inline-flex items-center gap-1 font-mono"
                      >
                        <span>Buka di Maps</span>
                        <ExternalLink size={12} />
                      </a>
                    </Show>
                  </div>
                  <input
                    type="text"
                    value={pickupMapsUrl()}
                    onInput={(e) => setPickupMapsUrl(e.currentTarget.value)}
                    placeholder="https://maps.google.com/?q=-7.4243120,109.2486710"
                    class="input-base text-xs font-mono bg-white"
                  />
                </div>
              </div>
            </Show>

            <div class="flex items-center justify-end gap-2 pt-3 border-t border-[#E8E8EC]">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                class="btn-secondary btn-sm"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmitting()}
                class="btn-primary btn-sm flex items-center gap-1.5"
              >
                <Show
                  when={isSubmitting()}
                  fallback={
                    <span>{editingBatchId() ? "Simpan Perubahan Batch" : "Simpan & Aktifkan Batch"}</span>
                  }
                >
                  <Loader2 size={13} class="animate-spin" />
                  <span>Menyimpan...</span>
                </Show>
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </AdminLayout>
  );
}
