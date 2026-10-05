import { createSignal, onMount, For, Show } from "solid-js";
import { AdminLayout } from "~/components/admin/AdminLayout";
import { Badge } from "~/components/ui/Badge";
import { Modal } from "~/components/ui/Modal";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { formatRupiah } from "~/lib/pricing";
import { Plus, Trash2, Edit3, Image, Loader2, UploadCloud, AlertCircle } from "lucide-solid";

export default function AdminMenuPage() {
  const [menuList, setMenuList] = createSignal<any[]>([]);
  const [isModalOpen, setIsModalOpen] = createSignal(false);
  const [editingMenuId, setEditingMenuId] = createSignal<number | null>(null);
  const [isLoading, setIsLoading] = createSignal(false);
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [menuError, setMenuError] = createSignal<string | null>(null);

  // Confirm delete dialog state
  const [deleteConfirm, setDeleteConfirm] = createSignal<{
    isOpen: boolean;
    menuId: number;
    name: string;
    isDeleting: boolean;
  }>({
    isOpen: false,
    menuId: 0,
    name: "",
    isDeleting: false,
  });

  // Form signals
  const [menuStep, setMenuStep] = createSignal<1 | 2 | 3>(1);
  const [sku, setSku] = createSignal("");
  const [name, setName] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [basePrice, setBasePrice] = createSignal(20000);
  const [weightGrams, setWeightGrams] = createSignal(250);
  const [images, setImages] = createSignal<string[]>([]);
  const [isActive, setIsActive] = createSignal(true);
  const [isUploadingImage, setIsUploadingImage] = createSignal(false);

  const fetchMenu = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/menu", { credentials: "include" });
      const data = await res.json();
      setMenuList(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  onMount(() => {
    fetchMenu();
  });

  const openCreateMenu = () => {
    setEditingMenuId(null);
    setMenuStep(1);
    setSku(`MM-${Date.now().toString(36).slice(-4).toUpperCase()}`);
    setName("");
    setDescription("");
    setBasePrice(20000);
    setWeightGrams(250);
    setImages([]);
    setIsActive(true);
    setMenuError(null);
    setIsModalOpen(true);
  };

  const openEditMenu = (m: any) => {
    setEditingMenuId(m.id);
    setMenuStep(1);
    setSku(m.sku || "");
    setName(m.name || "");
    setDescription(m.description || "");
    setBasePrice(m.basePrice || 20000);
    setWeightGrams(m.weightGrams || 250);
    const initialImgs = Array.isArray(m.images) && m.images.length > 0
      ? m.images
      : (m.imagePath ? [m.imagePath] : []);
    setImages(initialImgs);
    setIsActive(Boolean(m.isActive));
    setMenuError(null);
    setIsModalOpen(true);
  };

  const handleImageUpload = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const currentCount = images().length;
    if (currentCount >= 4) {
      setMenuError("Maksimal 4 foto per menu.");
      input.value = "";
      return;
    }

    const availableSlots = 4 - currentCount;
    const filesToUpload = Array.from(input.files).slice(0, availableSlots);

    // Validasi ukuran tiap file maksimal 4 MB (Sesuai Requirement 9)
    for (const file of filesToUpload) {
      if (file.size > 4 * 1024 * 1024) {
        setMenuError(`File "${file.name}" melebihi batas maksimal 4 MB.`);
        input.value = "";
        return;
      }
    }

    setIsUploadingImage(true);
    setMenuError(null);
    try {
      const uploadedPaths: string[] = [];
      for (const file of filesToUpload) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("category", "menus");

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (res.ok && data.success && data.path) {
          uploadedPaths.push(data.path);
        } else {
          setMenuError(data.error || "Gagal mengunggah foto.");
        }
      }

      if (uploadedPaths.length > 0) {
        setImages([...images(), ...uploadedPaths].slice(0, 4));
      }
    } catch (e: any) {
      setMenuError(e?.message || "Terjadi kesalahan saat mengunggah foto.");
    } finally {
      setIsUploadingImage(false);
      input.value = "";
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages(images().filter((_, i) => i !== index));
  };

  const handleSetPrimaryImage = (index: number) => {
    if (index === 0) return;
    const list = [...images()];
    const [target] = list.splice(index, 1);
    list.unshift(target);
    setImages(list);
  };

  const handleSaveMenu = async (e: Event) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMenuError(null);

    try {
      const currentImages = images();
      const payload: any = {
        sku: sku().trim(),
        name: name().trim(),
        description: description().trim(),
        basePrice: Number(basePrice()),
        weightGrams: Number(weightGrams()),
        imagePath: currentImages[0] || undefined,
        images: currentImages,
        isActive: isActive(),
      };

      const isEdit = editingMenuId() !== null;
      if (isEdit) {
        payload.id = editingMenuId();
      }

      const res = await fetch("/api/admin/menu", {
        method: isEdit ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setMenuError(data.error || "Gagal menyimpan menu");
        return;
      }

      setIsModalOpen(false);
      await fetchMenu();
    } catch (err: any) {
      setMenuError(err?.message || "Terjadi kesalahan saat menyimpan menu");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteMenu = (id: number, menuName: string) => {
    setDeleteConfirm({
      isOpen: true,
      menuId: id,
      name: menuName,
      isDeleting: false,
    });
  };

  const executeDeleteMenu = async () => {
    const { menuId } = deleteConfirm();
    setDeleteConfirm((prev) => ({ ...prev, isDeleting: true }));
    try {
      const res = await fetch(`/api/admin/menu?id=${menuId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setMenuError(data.error || "Gagal menghapus menu.");
      } else {
        await fetchMenu();
      }
    } catch (e: any) {
      setMenuError(e?.message || "Gagal menghapus menu.");
    } finally {
      setDeleteConfirm({ isOpen: false, menuId: 0, name: "", isDeleting: false });
    }
  };

  return (
    <AdminLayout title="Katalog Menu Produk">
      <div class="space-y-6">
        {/* Banner Alert jika ada pesan error */}
        <Show when={menuError()}>
          <div class="p-3.5 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/20 flex items-center justify-between text-xs text-[#EF4444]">
            <div class="flex items-center gap-2">
              <AlertCircle size={16} class="shrink-0" />
              <span>{menuError()}</span>
            </div>
            <button
              type="button"
              onClick={() => setMenuError(null)}
              class="font-semibold underline cursor-pointer text-[11px]"
            >
              Tutup
            </button>
          </div>
        </Show>

        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p class="text-xs sm:text-sm text-[#6B6B6B]">
            Kelola resep varian produk Mol-Mol, foto makanan, harga master, dan status ketersediaan.
          </p>

          <button
            type="button"
            onClick={openCreateMenu}
            class="btn-primary btn-sm flex items-center justify-center gap-1.5 cursor-pointer w-full sm:w-auto shrink-0"
          >
            <Plus size={15} />
            <span>Tambah Menu Baru</span>
          </button>
        </div>

        {/* Menu Items Table */}
        <div class="card-surface bg-[#FFF9EE] border border-[#E2CCA8] overflow-hidden rounded-2xl">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs min-w-[640px]">
              <thead class="bg-[#F3E2C4] text-[#806B5C] border-b border-[#E2CCA8] text-[11px] font-semibold uppercase">
              <tr>
                <th class="p-3">Foto</th>
                <th class="p-3">SKU</th>
                <th class="p-3">Nama Menu</th>
                <th class="p-3">Harga Master</th>
                <th class="p-3">Berat</th>
                <th class="p-3">Status</th>
                <th class="p-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-[#E2CCA8]">
              <For
                each={menuList()}
                fallback={
                  <tr>
                    <td colspan={7} class="p-8 text-center text-[#806B5C]">
                      Belum ada menu di katalog.
                    </td>
                  </tr>
                }
              >
                {(m) => (
                  <tr class="hover:bg-[#F3E2C4]/40 transition">
                    <td class="p-3">
                      <div class="relative w-11 h-11">
                        <Show
                          when={m.imagePath || (m.images && m.images[0])}
                          fallback={
                            <div class="w-11 h-11 rounded-lg bg-[#F3E2C4] flex items-center justify-center text-[#806B5C]">
                              <Image size={16} />
                            </div>
                          }
                        >
                          <img
                            src={m.imagePath || m.images[0]}
                            alt={m.name}
                            class="w-11 h-11 object-cover rounded-xl border border-[#E2CCA8]"
                          />
                        </Show>
                        <Show when={m.images && m.images.length > 1}>
                          <span
                            class="absolute -bottom-1 -right-1 bg-[#D92D3A] text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full shadow-xs"
                            title={`${m.images.length} foto`}
                          >
                            {m.images.length}
                          </span>
                        </Show>
                      </div>
                    </td>
                    <td class="p-3 font-semibold text-xs text-[#806B5C]">{m.sku}</td>
                    <td class="p-3 font-semibold text-[#5B4638]">{m.name}</td>
                    <td class="p-3 font-bold font-heading text-[#D92D3A]">
                      {formatRupiah(m.basePrice)}
                    </td>
                    <td class="p-3 text-xs text-[#806B5C] font-medium">{m.weightGrams}g</td>
                    <td class="p-3">
                      <Badge variant={m.isActive ? "success" : "default"}>
                        {m.isActive ? "Aktif" : "Non-aktif"}
                      </Badge>
                    </td>
                    <td class="p-3 text-right">
                      <div class="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditMenu(m)}
                          class="text-[#D92D3A] hover:bg-[#D92D3A]/10 p-1.5 rounded-lg transition cursor-pointer"
                          title="Edit Menu"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmDeleteMenu(m.id, m.name)}
                          class="text-[#D92D3A] hover:bg-[#FFF5F5] p-1.5 rounded-lg transition cursor-pointer"
                          title="Hapus Menu"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
          </div>
        </div>

        {/* Modal Buat / Edit Menu dengan Alur Step-by-Step (Requirement 3) */}
        <Modal
          isOpen={isModalOpen()}
          onClose={() => setIsModalOpen(false)}
          title={editingMenuId() ? "Edit Menu Produk" : "Tambah Menu Katalog Baru"}
          maxWidth="max-w-md"
        >
          <form onSubmit={handleSaveMenu} class="space-y-4 text-xs">
            {/* Step Navigation Tabs */}
            <div class="grid grid-cols-3 gap-1.5 border-b border-[#E2CCA8] pb-3 text-[11px]">
              <button
                type="button"
                onClick={() => setMenuStep(1)}
                class={`py-1.5 px-2 rounded-xl font-semibold transition text-center cursor-pointer ${
                  menuStep() === 1
                    ? "bg-[#D92D3A] text-white shadow-2xs"
                    : "bg-[#F3E2C4] text-[#806B5C] hover:text-[#5B4638]"
                }`}
              >
                1. Info Produk
              </button>
              <button
                type="button"
                onClick={() => setMenuStep(2)}
                class={`py-1.5 px-2 rounded-xl font-semibold transition text-center cursor-pointer ${
                  menuStep() === 2
                    ? "bg-[#D92D3A] text-white shadow-2xs"
                    : "bg-[#F3E2C4] text-[#806B5C] hover:text-[#5B4638]"
                }`}
              >
                2. Harga & Porsi
              </button>
              <button
                type="button"
                onClick={() => setMenuStep(3)}
                class={`py-1.5 px-2 rounded-xl font-semibold transition text-center cursor-pointer ${
                  menuStep() === 3
                    ? "bg-[#D92D3A] text-white shadow-2xs"
                    : "bg-[#F3E2C4] text-[#806B5C] hover:text-[#5B4638]"
                }`}
              >
                3. Foto & Status ({images().length}/4)
              </button>
            </div>

            {/* STEP 1: Informasi Produk */}
            <Show when={menuStep() === 1}>
              <div class="space-y-3.5 animate-in fade-in duration-150">
                <div>
                  <label class="block font-semibold text-[#5B4638] mb-1">SKU Produk</label>
                  <input
                    type="text"
                    required
                    value={sku()}
                    onInput={(e) => setSku(e.currentTarget.value)}
                    placeholder="Contoh: MM-COK01"
                    class="input-base text-xs uppercase"
                  />
                </div>

                <div>
                  <label class="block font-semibold text-[#0A0A0A] mb-1">Nama Menu</label>
                  <input
                    type="text"
                    required
                    value={name()}
                    onInput={(e) => setName(e.currentTarget.value)}
                    placeholder="Contoh: Mol-Mol Pandan Keju"
                    class="input-base text-xs"
                  />
                </div>

                <div>
                  <label class="block font-semibold text-[#0A0A0A] mb-1">Deskripsi Menu</label>
                  <textarea
                    rows={3}
                    value={description()}
                    onInput={(e) => setDescription(e.currentTarget.value)}
                    placeholder="Deskripsi kelezatan rasa, tekstur, atau rekomendasi penyajian..."
                    class="input-base text-xs"
                  />
                </div>
              </div>
            </Show>

            {/* STEP 2: Harga & Porsi */}
            <Show when={menuStep() === 2}>
              <div class="space-y-3.5 animate-in fade-in duration-150">
                <div>
                  <label class="block font-semibold text-[#0A0A0A] mb-1">Harga Master (Rp)</label>
                  <input
                    type="number"
                    min={1000}
                    required
                    value={basePrice()}
                    onInput={(e) => setBasePrice(Number(e.currentTarget.value))}
                    class="input-base text-xs"
                  />
                </div>

                <div>
                  <label class="block font-semibold text-[#0A0A0A] mb-1">Berat / Porsi (Gram)</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={weightGrams()}
                    onInput={(e) => setWeightGrams(Number(e.currentTarget.value))}
                    class="input-base text-xs"
                  />
                  <span class="text-[11px] text-[#6B6B6B] block mt-1">
                    Digunakan untuk informasi berat porsi di halaman katalog produk.
                  </span>
                </div>
              </div>
            </Show>

            {/* STEP 3: Foto Menu & Status */}
            <Show when={menuStep() === 3}>
              <div class="space-y-3.5 animate-in fade-in duration-150">
                <div class="flex items-center gap-2 p-2.5 rounded-xl border border-[#E2CCA8] bg-[#F3E2C4]/60">
                  <input
                    type="checkbox"
                    id="menuActive"
                    checked={isActive()}
                    onChange={(e) => setIsActive(e.currentTarget.checked)}
                    class="rounded text-[#D92D3A] cursor-pointer"
                  />
                  <label for="menuActive" class="text-xs font-semibold text-[#5B4638] cursor-pointer">
                    Menu Aktif & Dapat Ditampilkan di Katalog
                  </label>
                </div>

                {/* Foto Menu Upload (Maksimal 4 foto, batas 4 MB) */}
                <div class="space-y-2">
                  <div class="flex items-center justify-between">
                    <label class="block font-semibold text-[#5B4638]">
                      Foto Menu ({images().length}/4)
                    </label>
                    <span class="text-[11px] text-[#806B5C]">Maks 4 foto, maks 4 MB/foto</span>
                  </div>

                  {/* Upload Input & Status */}
                  <div class="flex items-center gap-3">
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp"
                      disabled={images().length >= 4 || isUploadingImage()}
                      onChange={handleImageUpload}
                      class="text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-full file:border-0 file:text-xs file:bg-[#D92D3A]/10 file:text-[#D92D3A] cursor-pointer disabled:opacity-50"
                    />
                    <Show when={isUploadingImage()}>
                      <div class="flex items-center gap-1.5 text-xs text-[#D92D3A]">
                        <Loader2 size={14} class="animate-spin" />
                        <span>Mengunggah...</span>
                      </div>
                    </Show>
                  </div>

                  {/* List of uploaded photos */}
                  <Show when={images().length > 0}>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      <For each={images()}>
                        {(img, idx) => (
                          <div class="relative group rounded-xl border border-[#E2CCA8] overflow-hidden bg-[#F3E2C4] flex flex-col items-center">
                            <img
                              src={img}
                              alt={`Foto ${idx() + 1}`}
                              class="w-full h-20 object-cover"
                            />
                            <div class="w-full py-0.5 text-center text-[10px] font-medium border-t border-[#E2CCA8] bg-[#FFF9EE]">
                              <Show when={idx() === 0} fallback={<span>Foto #{idx() + 1}</span>}>
                                <span class="text-[#D92D3A] font-bold">Utama</span>
                              </Show>
                            </div>

                            {/* Action overlay on hover */}
                            <div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center gap-1 p-1">
                              <Show when={idx() > 0}>
                                <button
                                  type="button"
                                  onClick={() => handleSetPrimaryImage(idx())}
                                  class="text-[9px] bg-white text-[#0A0A0A] hover:bg-[#F4F4F6] px-1.5 py-0.5 rounded cursor-pointer font-semibold shadow-xs"
                                  title="Jadikan Foto Utama"
                                >
                                  Utama
                                </button>
                              </Show>
                              <button
                                type="button"
                                onClick={() => handleRemoveImage(idx())}
                                class="text-[9px] bg-[#EF4444] text-white hover:bg-[#DC2626] px-1.5 py-0.5 rounded cursor-pointer flex items-center gap-1 shadow-xs"
                                title="Hapus Foto"
                              >
                                <Trash2 size={10} />
                                <span>Hapus</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </div>
            </Show>

            {/* Stepper Bottom Action Buttons */}
            <div class="flex items-center justify-between gap-2 pt-3 border-t border-[#E8E8EC]">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                class="btn-secondary btn-sm"
              >
                Batal
              </button>

              <div class="flex items-center gap-2">
                <Show when={menuStep() > 1}>
                  <button
                    type="button"
                    onClick={() => setMenuStep((s) => (s - 1) as any)}
                    class="btn-secondary btn-sm"
                  >
                    Sebelumnya
                  </button>
                </Show>

                <Show
                  when={menuStep() === 3}
                  fallback={
                    <button
                      type="button"
                      onClick={() => setMenuStep((s) => (s + 1) as any)}
                      class="btn-primary btn-sm"
                    >
                      Lanjut ({menuStep() + 1}/3)
                    </button>
                  }
                >
                  <button
                    type="submit"
                    disabled={isSubmitting()}
                    class="btn-primary btn-sm flex items-center gap-1.5"
                  >
                    <Show
                      when={isSubmitting()}
                      fallback={<span>{editingMenuId() ? "Simpan Perubahan Menu" : "Simpan Menu Baru"}</span>}
                    >
                      <Loader2 size={13} class="animate-spin" />
                      <span>Menyimpan...</span>
                    </Show>
                  </button>
                </Show>
              </div>
            </div>
          </form>
        </Modal>

        {/* Dialog Konfirmasi Hapus Menu Ramah Pengguna */}
        <ConfirmDialog
          isOpen={deleteConfirm().isOpen}
          title="Hapus Menu dari Katalog?"
          message={`Yakin ingin menghapus menu "${deleteConfirm().name}" dari katalog? Produk tidak akan lagi muncul di pilihan pre-order pelanggan.`}
          confirmText="Ya, Hapus Menu"
          cancelText="Batal"
          variant="danger"
          isLoading={deleteConfirm().isDeleting}
          onConfirm={executeDeleteMenu}
          onClose={() => setDeleteConfirm((prev) => ({ ...prev, isOpen: false }))}
        />
      </div>
    </AdminLayout>
  );
}
