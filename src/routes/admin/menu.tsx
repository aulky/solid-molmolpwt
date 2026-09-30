import { createSignal, onMount, For, Show } from "solid-js";
import { AdminLayout } from "~/components/admin/AdminLayout";
import { Badge } from "~/components/ui/Badge";
import { Modal } from "~/components/ui/Modal";
import { formatRupiah } from "~/lib/pricing";
import { Plus, Trash2, Edit3, Image, Loader2, UploadCloud } from "lucide-solid";

export default function AdminMenuPage() {
  const [menuList, setMenuList] = createSignal<any[]>([]);
  const [isModalOpen, setIsModalOpen] = createSignal(false);
  const [editingMenuId, setEditingMenuId] = createSignal<number | null>(null);
  const [isLoading, setIsLoading] = createSignal(false);
  const [isSubmitting, setIsSubmitting] = createSignal(false);

  // Form signals
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
    setSku(`MM-${Date.now().toString(36).slice(-4).toUpperCase()}`);
    setName("");
    setDescription("");
    setBasePrice(20000);
    setWeightGrams(250);
    setImages([]);
    setIsActive(true);
    setIsModalOpen(true);
  };

  const openEditMenu = (m: any) => {
    setEditingMenuId(m.id);
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
    setIsModalOpen(true);
  };

  const handleImageUpload = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const currentCount = images().length;
    if (currentCount >= 4) {
      alert("Maksimal 4 foto per menu.");
      input.value = "";
      return;
    }

    const availableSlots = 4 - currentCount;
    const filesToUpload = Array.from(input.files).slice(0, availableSlots);

    if (input.files.length > availableSlots) {
      alert(`Hanya ${availableSlots} foto yang diunggah karena batas maksimal 4 foto per produk.`);
    }

    setIsUploadingImage(true);
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
        }
      }

      if (uploadedPaths.length > 0) {
        setImages([...images(), ...uploadedPaths].slice(0, 4));
      }
    } catch (e) {
      console.error(e);
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
        alert(data.error || "Gagal menyimpan menu");
        return;
      }

      setIsModalOpen(false);
      await fetchMenu();
    } catch (err: any) {
      alert(err?.message || "Terjadi kesalahan");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteMenu = async (id: number) => {
    if (!confirm("Yakin ingin menghapus menu ini dari katalog?")) return;
    try {
      await fetch(`/api/admin/menu?id=${id}`, { method: "DELETE", credentials: "include" });
      await fetchMenu();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <AdminLayout title="Katalog Menu Produk">
      <div class="space-y-6">
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
        <div class="card-surface bg-white border border-[#E8E8EC] overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs min-w-[640px]">
              <thead class="bg-[#FAFAFA] text-[#6B6B6B] border-b border-[#E8E8EC] font-mono uppercase">
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
            <tbody class="divide-y divide-[#E8E8EC]">
              <For
                each={menuList()}
                fallback={
                  <tr>
                    <td colspan={7} class="p-8 text-center text-[#9C9C9C]">
                      Belum ada menu di katalog.
                    </td>
                  </tr>
                }
              >
                {(m) => (
                  <tr class="hover:bg-[#FAFAFA] transition">
                    <td class="p-3">
                      <div class="relative w-11 h-11">
                        <Show
                          when={m.imagePath || (m.images && m.images[0])}
                          fallback={
                            <div class="w-11 h-11 rounded bg-[#F4F4F6] flex items-center justify-center text-[#9C9C9C]">
                              <Image size={16} />
                            </div>
                          }
                        >
                          <img
                            src={m.imagePath || m.images[0]}
                            alt={m.name}
                            class="w-11 h-11 object-cover rounded border border-[#E8E8EC]"
                          />
                        </Show>
                        <Show when={m.images && m.images.length > 1}>
                          <span
                            class="absolute -bottom-1 -right-1 bg-[#6366F1] text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full shadow-xs"
                            title={`${m.images.length} foto`}
                          >
                            {m.images.length}
                          </span>
                        </Show>
                      </div>
                    </td>
                    <td class="p-3 font-mono text-[#6B6B6B]">{m.sku}</td>
                    <td class="p-3 font-semibold text-[#0A0A0A]">{m.name}</td>
                    <td class="p-3 font-mono font-bold text-[#0A0A0A]">
                      {formatRupiah(m.basePrice)}
                    </td>
                    <td class="p-3 font-mono text-[#6B6B6B]">{m.weightGrams}g</td>
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
                          class="text-[#6366F1] hover:bg-[#6366F1]/10 p-1.5 rounded transition cursor-pointer"
                          title="Edit Menu"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMenu(m.id)}
                          class="text-[#EF4444] hover:bg-[#FFF5F5] p-1.5 rounded transition cursor-pointer"
                          title="Hapus"
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

        {/* Modal Buat / Edit Menu */}
        <Modal
          isOpen={isModalOpen()}
          onClose={() => setIsModalOpen(false)}
          title={editingMenuId() ? "Edit Menu Produk" : "Tambah Menu Katalog Baru"}
          maxWidth="max-w-md"
        >
          <form onSubmit={handleSaveMenu} class="space-y-4 text-xs">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block font-semibold text-[#0A0A0A] mb-1">SKU</label>
                <input
                  type="text"
                  required
                  value={sku()}
                  onInput={(e) => setSku(e.currentTarget.value)}
                  class="input-base text-xs font-mono uppercase"
                />
              </div>
              <div>
                <label class="block font-semibold text-[#0A0A0A] mb-1">Berat (Gram)</label>
                <input
                  type="number"
                  required
                  value={weightGrams()}
                  onInput={(e) => setWeightGrams(Number(e.currentTarget.value))}
                  class="input-base text-xs font-mono"
                />
              </div>
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
                rows={2}
                value={description()}
                onInput={(e) => setDescription(e.currentTarget.value)}
                placeholder="Deskripsi singkat kelezatan rasa..."
                class="input-base text-xs"
              />
            </div>

            <div>
              <label class="block font-semibold text-[#0A0A0A] mb-1">Harga Master (Rp)</label>
              <input
                type="number"
                min={1000}
                required
                value={basePrice()}
                onInput={(e) => setBasePrice(Number(e.currentTarget.value))}
                class="input-base text-xs font-mono"
              />
            </div>

            <div class="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="menuActive"
                checked={isActive()}
                onChange={(e) => setIsActive(e.currentTarget.checked)}
                class="rounded text-[#6366F1] cursor-pointer"
              />
              <label for="menuActive" class="text-xs font-semibold text-[#0A0A0A] cursor-pointer">
                Menu Aktif & Dapat Dipesan
              </label>
            </div>

            {/* Foto Menu Upload (Bisa lebih dari 1 dan maksimal 4 foto) */}
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label class="block font-semibold text-[#0A0A0A]">
                  Foto Menu ({images().length}/4)
                </label>
                <span class="text-[11px] text-[#6B6B6B]">Maksimal 4 foto, foto 1 = Cover</span>
              </div>

              {/* Upload Input & Status */}
              <div class="flex items-center gap-3">
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  disabled={images().length >= 4 || isUploadingImage()}
                  onChange={handleImageUpload}
                  class="text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:bg-[#6366F1]/10 file:text-[#6366F1] cursor-pointer disabled:opacity-50"
                />
                <Show when={isUploadingImage()}>
                  <div class="flex items-center gap-1.5 text-xs text-[#6366F1]">
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
                      <div class="relative group rounded border border-[#E8E8EC] overflow-hidden bg-[#FAFAFA] flex flex-col items-center">
                        <img
                          src={img}
                          alt={`Foto ${idx() + 1}`}
                          class="w-full h-20 object-cover"
                        />
                        <div class="w-full py-0.5 text-center text-[10px] font-mono font-medium border-t border-[#E8E8EC] bg-white">
                          <Show when={idx() === 0} fallback={<span>Foto #{idx() + 1}</span>}>
                            <span class="text-[#6366F1] font-bold">Utama</span>
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
                  fallback={<span>{editingMenuId() ? "Simpan Perubahan Menu" : "Simpan Menu Baru"}</span>}
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
