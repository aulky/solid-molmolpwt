import { createSignal, onMount, For, Show } from "solid-js";
import { AdminLayout } from "~/components/admin/AdminLayout";
import { Badge } from "~/components/ui/Badge";
import { Modal } from "~/components/ui/Modal";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
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
  Trash2,
  UtensilsCrossed,
  AlertCircle,
} from "lucide-solid";

export default function AdminBatchesPage() {
  const [batches, setBatches] = createSignal<any[]>([]);
  const [availableMenus, setAvailableMenus] = createSignal<any[]>([]);
  const [selectedMenuItemIds, setSelectedMenuItemIds] = createSignal<number[]>([]);
  const [batchStep, setBatchStep] = createSignal<1 | 2 | 3 | 4>(1);

  const [isModalOpen, setIsModalOpen] = createSignal(false);
  const [editingBatchId, setEditingBatchId] = createSignal<number | null>(null);
  const [isLoading, setIsLoading] = createSignal(false);
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [statusTogglingId, setStatusTogglingId] = createSignal<number | null>(null);
  const [uiError, setUiError] = createSignal<string | null>(null);

  // Confirm delete dialog state
  const [deleteConfirm, setDeleteConfirm] = createSignal<{
    isOpen: boolean;
    batchId: number;
    code: string;
    isDeleting: boolean;
  }>({
    isOpen: false,
    batchId: 0,
    code: "",
    isDeleting: false,
  });

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

  const fetchMenus = async () => {
    try {
      const res = await fetch("/api/admin/menu", { credentials: "include" });
      const data = await res.json();
      setAvailableMenus(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    }
  };

  onMount(() => {
    fetchBatches();
    fetchMenus();
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
      setUiError("Browser tidak mendukung geolokasi GPS.");
      return;
    }
    setIsDetectingGps(true);
    setUiError(null);
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
        setUiError(`Gagal mengambil titik GPS: ${err.message}`);
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
    setBatchStep(1);
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

    // Default semua menu aktif dicentang untuk batch baru
    setSelectedMenuItemIds(availableMenus().map((m) => m.id));

    setUiError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (b: any) => {
    setEditingBatchId(b.id);
    setBatchStep(1);
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

    // Set menu items yang dipilih untuk batch ini
    if (b.selectedItemIds && Array.isArray(b.selectedItemIds)) {
      setSelectedMenuItemIds(b.selectedItemIds);
    } else {
      setSelectedMenuItemIds(availableMenus().map((m) => m.id));
    }

    setUiError(null);
    setIsModalOpen(true);
  };

  const handleToggleStatus = async (batch: any) => {
    const nextStatus = batch.status === "open" ? "closed" : "open";
    setStatusTogglingId(batch.id);
    try {
      const res = await fetch("/api/admin/batches", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: batch.id,
          action: "toggle_status",
          status: nextStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setUiError(data.error || "Gagal mengubah status batch.");
      } else {
        await fetchBatches();
      }
    } catch (e: any) {
      setUiError(e?.message || "Terjadi kesalahan saat mengubah status batch.");
    } finally {
      setStatusTogglingId(null);
    }
  };

  const handleSaveBatch = async (e: Event) => {
    e.preventDefault();
    setIsSubmitting(true);
    setUiError(null);

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
        itemIds: selectedMenuItemIds(),
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
        setUiError(data.error || "Gagal menyimpan batch");
        return;
      }

      setIsModalOpen(false);
      await fetchBatches();
    } catch (err: any) {
      setUiError(err?.message || "Terjadi kesalahan saat menyimpan batch");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteBatch = (id: number, batchCode: string) => {
    setDeleteConfirm({
      isOpen: true,
      batchId: id,
      code: batchCode,
      isDeleting: false,
    });
  };

  const executeDeleteBatch = async () => {
    const { batchId } = deleteConfirm();
    setDeleteConfirm((prev) => ({ ...prev, isDeleting: true }));

    try {
      const res = await fetch(`/api/admin/batches?id=${batchId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setUiError(data.error || "Gagal menghapus batch.");
      } else {
        await fetchBatches();
      }
    } catch (e: any) {
      setUiError(e?.message || "Gagal menghapus batch.");
    } finally {
      setDeleteConfirm({ isOpen: false, batchId: 0, code: "", isDeleting: false });
    }
  };

  return (
    <AdminLayout title="Manajemen Gelombang Pre-Order (Batch PO)">
      <div class="space-y-6">
        {/* Banner Alert Notifikasi jika ada error */}
        <Show when={uiError()}>
          <div class="p-3.5 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/20 flex items-center justify-between text-xs text-[#EF4444]">
            <div class="flex items-center gap-2">
              <AlertCircle size={16} class="shrink-0" />
              <span>{uiError()}</span>
            </div>
            <button
              type="button"
              onClick={() => setUiError(null)}
              class="font-semibold underline cursor-pointer text-[11px]"
            >
              Tutup
            </button>
          </div>
        </Show>

        {/* Header Action */}
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p class="text-xs sm:text-sm text-[#6B6B6B]">
            Atur periode pembukaan PO, pilih menu yang dibuka per batch, kuota pesanan, dan tanggal kirim.
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
              <div class="card-surface p-5 bg-white border border-[#E8E8EC] rounded-xl space-y-4 shadow-2xs">
                <div class="flex items-center justify-between pb-3 border-b border-[#E8E8EC]">
                  <div>
                    <span class="text-xs font-mono font-bold text-[#6366F1] block">
                      {b.code}
                    </span>
                    <h3 class="font-heading font-bold text-base text-[#0A0A0A]">
                      {b.title}
                    </h3>
                  </div>

                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={statusTogglingId() === b.id}
                      onClick={() => handleToggleStatus(b)}
                      class={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                        b.status === "open"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                          : "bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200"
                      }`}
                      title={b.status === "open" ? "Klik untuk Tutup PO" : "Klik untuk Buka PO"}
                    >
                      <Show when={statusTogglingId() === b.id} fallback={
                        b.status === "open" ? (
                          <>
                            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span>PO Aktif</span>
                          </>
                        ) : (
                          <>
                            <span class="w-1.5 h-1.5 rounded-full bg-gray-400" />
                            <span>Ditutup</span>
                          </>
                        )
                      }>
                        <Loader2 size={12} class="animate-spin text-[#6366F1]" />
                        <span>Mengubah...</span>
                      </Show>
                    </button>

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
                </div>

                <div class="space-y-1.5 text-xs text-[#6B6B6B]">
                  <div class="flex items-center justify-between">
                    <span class="flex items-center gap-1">
                      <Clock size={13} /> Tutup PO:
                    </span>
                    <span class="font-medium text-[#0A0A0A]">
                      {formatTanggalWIB(b.orderCloseAt)}
                    </span>
                  </div>

                  <div class="flex items-center justify-between">
                    <span class="flex items-center gap-1">
                      <Calendar size={13} /> Jadwal Kirim:
                    </span>
                    <span class="font-medium text-[#0A0A0A]">
                      {formatTanggalWIB(b.deliveryDate, { includeTime: false })}
                    </span>
                  </div>

                  <div class="flex items-center justify-between">
                    <span class="flex items-center gap-1">
                      <Layers size={13} /> Kuota Pesanan:
                    </span>
                    <span class="font-semibold text-[#0A0A0A]">
                      {b.quotaUsed} / {b.quotaTotal} slot
                    </span>
                  </div>

                  <div class="flex items-center justify-between pt-1 border-t border-[#F4F4F6]">
                    <span class="flex items-center gap-1">
                      <UtensilsCrossed size={13} class="text-[#6366F1]" /> Menu Pre-Order:
                    </span>
                    <span class="font-semibold text-[#6366F1]">
                      {b.activeItemCount ?? b.selectedItemIds?.length ?? 0} varian dibuka
                    </span>
                  </div>
                </div>

                <div class="pt-3 border-t border-[#E8E8EC] flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B6B6B]">
                  <div class="space-x-1.5 sm:space-x-2 text-[11px] sm:text-xs">
                    <span>Ongkir: {formatRupiah(b.deliveryFeeFlat)}</span>
                    <span>• Min Gratis: {formatRupiah(b.freeDeliveryMin || 0)}</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditModal(b)}
                      class="btn-secondary btn-sm text-[11px] h-7 px-2.5 flex items-center gap-1 cursor-pointer hover:text-[#6366F1] shrink-0"
                      title="Edit Batch PO"
                    >
                      <Edit3 size={12} />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmDeleteBatch(b.id, b.code)}
                      class="btn-secondary btn-sm text-[11px] h-7 px-2.5 flex items-center gap-1 cursor-pointer text-[#EF4444] hover:bg-[#EF4444]/10 hover:border-[#EF4444]/30 shrink-0"
                      title="Hapus Batch PO"
                    >
                      <Trash2 size={12} />
                      <span>Hapus</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>

        {/* Modal Buat / Edit Batch dengan Alur Step-by-Step (Requirement 3) */}
        <Modal
          isOpen={isModalOpen()}
          onClose={() => setIsModalOpen(false)}
          title={editingBatchId() ? "Edit Gelombang Batch PO" : "Buka Gelombang PO Baru"}
          maxWidth="max-w-xl"
        >
          <form onSubmit={handleSaveBatch} class="space-y-4 text-xs">
            {/* Step Navigation Tabs */}
            <div class="grid grid-cols-4 gap-1.5 border-b border-[#E8E8EC] pb-3 text-[11px]">
              <button
                type="button"
                onClick={() => setBatchStep(1)}
                class={`py-1.5 px-2 rounded-lg font-semibold transition text-center cursor-pointer ${
                  batchStep() === 1
                    ? "bg-[#6366F1] text-white shadow-2xs"
                    : "bg-[#F4F4F6] text-[#6B6B6B] hover:text-[#0A0A0A]"
                }`}
              >
                1. Info Dasar
              </button>
              <button
                type="button"
                onClick={() => setBatchStep(2)}
                class={`py-1.5 px-2 rounded-lg font-semibold transition text-center cursor-pointer ${
                  batchStep() === 2
                    ? "bg-[#6366F1] text-white shadow-2xs"
                    : "bg-[#F4F4F6] text-[#6B6B6B] hover:text-[#0A0A0A]"
                }`}
              >
                2. Jadwal & Kuota
              </button>
              <button
                type="button"
                onClick={() => setBatchStep(3)}
                class={`py-1.5 px-2 rounded-lg font-semibold transition text-center cursor-pointer ${
                  batchStep() === 3
                    ? "bg-[#6366F1] text-white shadow-2xs"
                    : "bg-[#F4F4F6] text-[#6B6B6B] hover:text-[#0A0A0A]"
                }`}
              >
                3. Menu PO ({selectedMenuItemIds().length})
              </button>
              <button
                type="button"
                onClick={() => setBatchStep(4)}
                class={`py-1.5 px-2 rounded-lg font-semibold transition text-center cursor-pointer ${
                  batchStep() === 4
                    ? "bg-[#6366F1] text-white shadow-2xs"
                    : "bg-[#F4F4F6] text-[#6B6B6B] hover:text-[#0A0A0A]"
                }`}
              >
                4. Lokasi & Kirim
              </button>
            </div>

            {/* STEP 1: Informasi Dasar */}
            <Show when={batchStep() === 1}>
              <div class="space-y-3.5 animate-in fade-in duration-150">
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block font-semibold text-[#0A0A0A] mb-1">Kode Batch</label>
                    <input
                      type="text"
                      required
                      value={code()}
                      onInput={(e) => setCode(e.currentTarget.value)}
                      placeholder="Contoh: PO-2026-10-B"
                      class="input-base text-xs uppercase"
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
                  <label class="block font-semibold text-[#0A0A0A] mb-1">Judul Gelombang PO</label>
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
                    rows={3}
                    value={description()}
                    onInput={(e) => setDescription(e.currentTarget.value)}
                    placeholder="Catatan atau pengumuman khusus untuk pelanggan pada batch ini..."
                    class="input-base text-xs"
                  />
                </div>
              </div>
            </Show>

            {/* STEP 2: Jadwal & Kuota */}
            <Show when={batchStep() === 2}>
              <div class="space-y-3.5 animate-in fade-in duration-150">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label class="block font-semibold text-[#0A0A0A] mb-1">Batas Tutup PO</label>
                    <input
                      type="datetime-local"
                      required
                      value={orderCloseAt()}
                      onInput={(e) => setOrderCloseAt(e.currentTarget.value)}
                      class="input-base text-xs"
                    />
                  </div>

                  <div>
                    <label class="block font-semibold text-[#0A0A0A] mb-1">Tanggal Pengiriman / Selesai</label>
                    <input
                      type="datetime-local"
                      required
                      value={deliveryDate()}
                      onInput={(e) => setDeliveryDate(e.currentTarget.value)}
                      class="input-base text-xs"
                    />
                  </div>
                </div>

                <div class="grid grid-cols-3 gap-3">
                  <div>
                    <label class="block font-semibold text-[#0A0A0A] mb-1">Total Kuota (Slot)</label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={quotaTotal()}
                      onInput={(e) => setQuotaTotal(Number(e.currentTarget.value))}
                      class="input-base text-xs"
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
                      class="input-base text-xs"
                    />
                  </div>

                  <div>
                    <label class="block font-semibold text-[#0A0A0A] mb-1">Min Gratis (Rp)</label>
                    <input
                      type="number"
                      min={0}
                      value={freeDeliveryMin()}
                      onInput={(e) => setFreeDeliveryMin(Number(e.currentTarget.value))}
                      class="input-base text-xs"
                    />
                  </div>
                </div>
              </div>
            </Show>

            {/* STEP 3: Pemilihan Menu yang Dibuka */}
            <Show when={batchStep() === 3}>
              <div class="space-y-2.5 animate-in fade-in duration-150">
                <div class="flex items-center justify-between">
                  <div>
                    <label class="block font-semibold text-[#0A0A0A]">
                      Pilih Menu yang Dibuka untuk PO Ini
                    </label>
                    <span class="text-[11px] text-[#6B6B6B]">
                      {selectedMenuItemIds().length} dari {availableMenus().length} varian dipilih
                    </span>
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedMenuItemIds(availableMenus().map((m) => m.id))}
                      class="text-[11px] text-[#6366F1] hover:underline font-semibold cursor-pointer"
                    >
                      Pilih Semua
                    </button>
                    <span class="text-[#CBD5E1]">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedMenuItemIds([])}
                      class="text-[11px] text-[#6B6B6B] hover:underline cursor-pointer"
                    >
                      Batal Pilih
                    </button>
                  </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto p-1.5 rounded-xl border border-[#E8E8EC] bg-[#FAFAFA]">
                  <For
                    each={availableMenus()}
                    fallback={
                      <div class="col-span-2 py-4 text-center text-xs text-[#9C9C9C]">
                        Belum ada katalog menu dibuat di menu CMS.
                      </div>
                    }
                  >
                    {(m) => {
                      const isChecked = () => selectedMenuItemIds().includes(m.id);
                      const toggle = () => {
                        if (isChecked()) {
                          setSelectedMenuItemIds(selectedMenuItemIds().filter((id) => id !== m.id));
                        } else {
                          setSelectedMenuItemIds([...selectedMenuItemIds(), m.id]);
                        }
                      };

                      return (
                        <div
                          onClick={toggle}
                          class={`flex items-center gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition select-none ${
                            isChecked()
                              ? "bg-white border-[#6366F1] shadow-2xs ring-1 ring-[#6366F1]/30"
                              : "bg-white/70 border-[#E8E8EC] opacity-60 hover:opacity-100"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked()}
                            onChange={() => {}}
                            class="rounded text-[#6366F1] focus:ring-[#6366F1] cursor-pointer"
                          />
                          <Show
                            when={m.imagePath}
                            fallback={
                              <div class="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                                <UtensilsCrossed size={14} />
                              </div>
                            }
                          >
                            <img
                              src={m.imagePath}
                              alt={m.name}
                              class="w-8 h-8 rounded object-cover border border-[#E8E8EC] shrink-0"
                            />
                          </Show>
                          <div class="min-w-0 flex-1">
                            <span class="font-medium text-[#0A0A0A] block truncate">{m.name}</span>
                            <span class="text-[10px] text-[#6B6B6B]">
                              {formatRupiah(m.basePrice)}
                            </span>
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </div>
            </Show>

            {/* STEP 4: Metode & Lokasi Pengambilan */}
            <Show when={batchStep() === 4}>
              <div class="space-y-3.5 animate-in fade-in duration-150">
                <div class="space-y-1.5">
                  <label class="block font-semibold text-[#0A0A0A]">
                    Metode Pemenuhan yang Diizinkan
                  </label>
                  <div class="grid grid-cols-3 gap-2">
                    <label class="flex items-center gap-2 p-2 rounded-lg border border-[#E8E8EC] bg-[#FAFAFA] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowPickup()}
                        onChange={(e) => setAllowPickup(e.currentTarget.checked)}
                        class="rounded text-[#6366F1]"
                      />
                      <span>Ambil Sendiri</span>
                    </label>
                    <label class="flex items-center gap-2 p-2 rounded-lg border border-[#E8E8EC] bg-[#FAFAFA] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowDelivery()}
                        onChange={(e) => setAllowDelivery(e.currentTarget.checked)}
                        class="rounded text-[#6366F1]"
                      />
                      <span>Diantar Toko</span>
                    </label>
                    <label class="flex items-center gap-2 p-2 rounded-lg border border-[#E8E8EC] bg-[#FAFAFA] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowCod()}
                        onChange={(e) => setAllowCod(e.currentTarget.checked)}
                        class="rounded text-[#6366F1]"
                      />
                      <span>COD</span>
                    </label>
                  </div>
                </div>

                {/* Sub-form Pengambilan Mandiri */}
                <Show when={allowPickup()}>
                  <div class="p-3.5 rounded-xl border border-[#6366F1]/30 bg-[#6366F1]/5 space-y-3">
                    <div class="flex items-center justify-between pb-1.5 border-b border-[#6366F1]/15">
                      <div class="flex items-center gap-1.5 font-bold text-xs text-[#0A0A0A]">
                        <MapPin size={14} class="text-[#6366F1]" />
                        <span>Titik & Alamat Pengambilan (Pickup)</span>
                      </div>
                      <div class="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleCopyStoreAddress}
                          class="text-[11px] text-[#6366F1] hover:underline font-medium cursor-pointer"
                        >
                          Salin dari Toko
                        </button>
                        <span class="text-[#CBD5E1]">•</span>
                        <button
                          type="button"
                          onClick={handleGetBatchGps}
                          disabled={isDetectingGps()}
                          class="text-[11px] text-[#6366F1] hover:underline font-medium cursor-pointer flex items-center gap-1"
                        >
                          <Show when={isDetectingGps()} fallback={<Navigation size={11} />}>
                            <Loader2 size={11} class="animate-spin text-[#6366F1]" />
                          </Show>
                          <span>{isDetectingGps() ? "Mendeteksi..." : "Deteksi GPS"}</span>
                        </button>
                      </div>
                    </div>

                    <div class="grid grid-cols-2 gap-2">
                      <div>
                        <span class="text-[11px] text-[#6B6B6B]">Jam Mulai Ambil:</span>
                        <input
                          type="text"
                          placeholder="13:00"
                          value={pickupStart()}
                          onInput={(e) => setPickupStart(e.currentTarget.value)}
                          class="input-base text-xs bg-white"
                        />
                      </div>
                      <div>
                        <span class="text-[11px] text-[#6B6B6B]">Jam Selesai Ambil:</span>
                        <input
                          type="text"
                          placeholder="17:00"
                          value={pickupEnd()}
                          onInput={(e) => setPickupEnd(e.currentTarget.value)}
                          class="input-base text-xs bg-white"
                        />
                      </div>
                    </div>

                    <div>
                      <span class="text-[11px] text-[#6B6B6B]">Alamat Pengambilan Lengkap:</span>
                      <textarea
                        rows={2}
                        value={pickupAddress()}
                        onInput={(e) => setPickupAddress(e.currentTarget.value)}
                        placeholder="Contoh: Jl. Ringin Tirto No. 12, Bancarkembar"
                        class="input-base text-xs bg-white"
                      />
                    </div>

                    <div class="grid grid-cols-2 gap-2">
                      <div>
                        <span class="text-[11px] text-[#6B6B6B]">Latitude:</span>
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
                          class="input-base text-xs bg-white"
                        />
                      </div>
                      <div>
                        <span class="text-[11px] text-[#6B6B6B]">Longitude:</span>
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
                          class="input-base text-xs bg-white"
                        />
                      </div>
                    </div>

                    <Show when={pickupMapsUrl()}>
                      <div class="pt-1 flex items-center justify-between text-[11px]">
                        <span class="text-[#6B6B6B]">Tautan Google Maps Titik Pickup:</span>
                        <a
                          href={pickupMapsUrl()}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-[#6366F1] flex items-center gap-1 hover:underline font-semibold"
                        >
                          <MapPin size={12} />
                          <span>Buka di Google Maps</span>
                          <ExternalLink size={10} />
                        </a>
                      </div>
                    </Show>
                  </div>
                </Show>
              </div>
            </Show>

            {/* Stepper Bottom Action Buttons */}
            <div class="pt-3 border-t border-[#E8E8EC] flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                class="btn-secondary btn-sm"
              >
                Batal
              </button>

              <div class="flex items-center gap-2">
                <Show when={batchStep() > 1}>
                  <button
                    type="button"
                    onClick={() => setBatchStep((s) => (s - 1) as any)}
                    class="btn-secondary btn-sm"
                  >
                    Sebelumnya
                  </button>
                </Show>

                <Show
                  when={batchStep() === 4}
                  fallback={
                    <button
                      type="button"
                      onClick={() => setBatchStep((s) => (s + 1) as any)}
                      class="btn-primary btn-sm"
                    >
                      Lanjut ({batchStep() + 1}/4)
                    </button>
                  }
                >
                  <button
                    type="submit"
                    disabled={isSubmitting()}
                    class="btn-primary btn-sm flex items-center gap-1.5"
                  >
                    <Show when={isSubmitting()}>
                      <Loader2 size={13} class="animate-spin" />
                    </Show>
                    <span>{editingBatchId() ? "Simpan Perubahan Batch" : "Simpan & Buka Batch"}</span>
                  </button>
                </Show>
              </div>
            </div>
          </form>
        </Modal>

        {/* Dialog Konfirmasi Hapus Batch Modern */}
        <ConfirmDialog
          isOpen={deleteConfirm().isOpen}
          title="Hapus Gelombang Batch PO?"
          message={`Yakin ingin menghapus batch "${deleteConfirm().code}"? Jika belum ada pesanan yang masuk, batch akan dihapus permanen.`}
          confirmText="Ya, Hapus Batch"
          cancelText="Batal"
          variant="danger"
          isLoading={deleteConfirm().isDeleting}
          onConfirm={executeDeleteBatch}
          onClose={() => setDeleteConfirm((prev) => ({ ...prev, isOpen: false }))}
        />
      </div>
    </AdminLayout>
  );
}
