# Plan: Website Pre-Order UMKM Mol-Mol Purwokerto

> Stack: **SolidStart v2 + MySQL**. Deploy: **VPS Linux (Node + MySQL)**.

---

## 0. Ringkasan Keputusan yang Sudah Divalidasi

| Topik | Keputusan | Implikasi teknis |
|---|---|---|
| Hosting | VPS Linux, Node + MySQL self-host | Upload foto boleh ke disk lokal; wajib setup Nginx + TLS + PM2/systemd + backup |
| Alur bayar | **Bukti bayar wajib saat checkout** | Order & UUID terbit hanya setelah bukti terunggah; butuh upload sementara + transaksi DB + pembersihan file orphan |
| Kuota | **Kuota batch + stok per menu** | Butuh tabel penawaran menu per batch, pengurangan stok atomik, dan pemulihan stok saat order dibatalkan |
| Notifikasi | **Telegram** (bukan WhatsApp) | Bot Telegram untuk alert admin; deep-link untuk pelanggan subscribe status pesanan |

---

## 1. Tech Stack Final

**Sudah ada di repo** (SolidStart 2.0.5, Tailwind v4, Nitro, Node >= 24).

**Perlu ditambahkan:**

| Kebutuhan | Pilihan | Alasan |
|---|---|---|
| ORM + driver | `drizzle-orm`, `mysql2`, `drizzle-kit` | Type-safe, migrasi terkelola, SQL tetap bisa ditulis manual untuk query kuota atomik |
| Validasi | `zod` | Satu skema dipakai di client & server (form + API) |
| Ikon | `lucide-solid` | Konsisten, stroke seragam, tanpa emotikon |
| Upload/multipart | `nitro` native (`readMultipartFormData`) | Tidak perlu library tambahan |
| Pemroses gambar | `sharp` | Re-encode ke WebP, strip EXIF (privasi GPS), buat varian ukuran |
| Deteksi tipe file | `file-type` | Validasi MIME dari magic bytes, bukan dari nama file |
| Hash password | `argon2` (fallback `bcryptjs`) | Standar modern untuk kredensial admin |
| Cron internal | `nitro` scheduled task / `node-cron` | Bersihkan file orphan & tutup batch PO otomatis |
| Logging | `pino` | Log terstruktur, siap dibaca saat debug produksi |
| Testing | `vitest` + `playwright` | Unit untuk logika harga/kuota, e2e untuk alur PO |

**Tidak dipakai:** library UI kit siap pakai (Mantine/daisyUI). Alasan: justru sumber utama tampilan "template generik". Komponen ditulis sendiri di atas Tailwind dengan design token.

---

## 2. Arsitektur Aplikasi

### 2.1 Lapisan

```
src/
  routes/            # Halaman & API (file-based routing SolidStart)
  components/
    ui/              # Button, Input, Card, Badge, Dialog, Toast, Stepper...
    catalog/         # ProductCard, ProductGallery, QtyStepper
    checkout/        # CartSheet, CustomerForm, GpsPicker, PaymentProofUpload
    tracking/        # StatusTimeline, OrderSummary
    admin/           # DataTable, StatCard, BatchForm, MenuForm
  lib/
    db/
      index.ts       # Koneksi pool mysql2 + drizzle
      schema.ts      # Definisi tabel
    services/        # logika bisnis (order, batch, stock, media, telegram)
    pricing.ts       # fungsi murni: subtotal, ongkir, diskon, total
    validation.ts    # skema zod bersama
    storage.ts       # adapter penyimpanan file (disk lokal)
    telegram.ts      # adapter Bot API
    auth.ts          # session, hash, guard
```

**Prinsip:** semua aturan bisnis (kuota, harga, transisi status) hidup di `lib/services/*` sebagai fungsi murni yang bisa diuji, **bukan** tersebar di komponen. Route hanya memanggil service.

### 2.2 Mode Data

Gunakan **SolidStart server functions** (`"use server"`) + `query`/`action` dari `@solidjs/router` untuk mutasi utama.

Alasan: form tetap berfungsi **tanpa JavaScript** (progressive enhancement). Krusial karena pelanggan UMKM sering membuka dari HP dengan sinyal buruk.

---

## 3. Skema Database (MySQL 8, InnoDB, utf8mb4)

**Aturan umum:**
- Semua nominal uang disimpan sebagai `INT UNSIGNED` (rupiah, tanpa sen) — hindari `FLOAT`/`DECIMAL` untuk uang.
- Timestamp disimpan **UTC** (`DATETIME`), ditampilkan **WIB (Asia/Jakarta)**. Zona waktu eksplisit, jangan mengandalkan default server.
- Relasi pakai `ON DELETE RESTRICT` secara default; data historis pesanan tidak boleh ikut terhapus.
- Soft delete (`deleted_at`) untuk menu & batch agar riwayat pesanan tetap utuh.

### 3.1 Katalog & Media

```
media               -- semua gambar terpusat, bisa dipakai ulang
  id, path, mime, width, height, size_bytes,
  variants JSON      -- { thumb, card, full } dalam WebP
  alt, created_at

menu_items          -- katalog master (produk)
  id, sku UNIQUE, slug UNIQUE, name, description,
  category_id, base_price, compare_at_price NULL,
  weight_grams, max_per_order, sort_order,
  is_active, is_featured, deleted_at, created_at, updated_at

menu_item_images    -- galeri (marketplace butuh >1 foto)
  id, menu_item_id, media_id, sort_order, is_primary

categories          -- id, name, slug, sort_order, is_active
```

### 3.2 Batch PO (gelombang pre-order)

```
batches
  id, code UNIQUE            -- contoh: "PO-2026-10-A"
  title, slug, description,
  order_open_at, order_close_at,        -- WIB, jam tutup tampil countdown
  delivery_date, pickup_start, pickup_end,
  quota_total, quota_used,              -- kuota batch (jumlah order)
  delivery_fee_flat, free_delivery_min NULL,
  allow_pickup, allow_delivery, allow_cod,
  status ENUM('draft','open','closed','production','delivered','cancelled'),
  created_at, updated_at

batch_items          -- menu apa saja yang dibuka pada batch ini + stoknya
  id, batch_id, menu_item_id,
  price_override NULL,        -- harga khusus batch, kalau ada
  stock_total NULL,           -- NULL = tidak dibatasi
  stock_used,
  is_available,
  UNIQUE(batch_id, menu_item_id)
```

**Kenapa `batch_items` penting:** ini yang menjawab permintaan "tambah ITEM ke PO tanggal X dengan kuota". Satu batch bisa membuka sebagian katalog saja, dengan harga dan stok yang berbeda dari batch lain. Katalog master tetap bersih.

```
stock_movements      -- audit pergerakan stok (jangan pernah update stok tanpa jejak)
  id, batch_item_id, delta INT, reason ENUM('order_created','order_cancelled','admin_adjust','correction'),
  ref_order_id NULL, note, actor_admin_id NULL, created_at
```

### 3.3 Pesanan

```
orders
  id CHAR(36) PK                -- UUID v4 (kanonik, dipakai di URL)
  short_code VARCHAR(10) UNIQUE -- contoh "MM-7K2P4Q" untuk dibacakan via telepon
  batch_id,
  customer_name, customer_phone,       -- dinormalisasi ke 628xxxxxxxxxx
  customer_telegram NULL,
  fulfillment ENUM('pickup','delivery','cod'),
  address_text NULL, address_note NULL,
  latitude DECIMAL(10,7) NULL, longitude DECIMAL(10,7) NULL,
  gps_accuracy_m INT NULL,
  location_source ENUM('gps_device','maps_pin','manual') NULL,
  subtotal, delivery_fee, discount, total,
  payment_method ENUM('qris','transfer'),
  payment_proof_media_id NULL,
  payment_status ENUM('unpaid','pending_verification','verified','rejected'),
  status ENUM('menunggu_verifikasi','dikonfirmasi','diproduksi','siap_diambil','dikirim','selesai','ditolak','dibatalkan'),
  admin_note NULL, internal_note NULL,
  idempotency_key UNIQUE,
  created_at, verified_at, completed_at, cancelled_at, cancel_reason

order_items          -- SNAPSHOT nama & harga saat transaksi
  id, order_id, batch_item_id, menu_item_id,
  name_snapshot,    -- nama produk saat dibeli (kalau nama produk diedit nanti, struk lama tetap benar)
  unit_price, qty, line_total, note

order_status_history -- setiap perubahan status tercatat
  id, order_id, from_status, to_status,
  actor_type ENUM('system','admin','customer'), actor_admin_id NULL,
  note, created_at

telegram_subscriptions
  id, order_id NULL, chat_id, username, is_admin BOOL, is_active, created_at
```

### 3.4 Admin, Sesi, Audit, Pengaturan

```
admin_users     id, username UNIQUE, password_hash, display_name,
                role ENUM('owner','staff'), is_active, last_login_at

admin_sessions  id, token_hash UNIQUE, admin_user_id, expires_at, ip, user_agent, created_at

audit_log       id, admin_user_id, action, entity, entity_id,
                payload JSON, ip, created_at

settings        -- single row (id=1), CMS pengaturan toko
  id, store_name, store_tagline, logo_media_id,
  qris_media_id, bank_name, bank_account_no, bank_account_name,
  allow_delivery, allow_cod, flat_delivery_fee, free_delivery_min,
  announcement_text, announcement_active,
  admin_phone, admin_telegram_chat_id,
  operational_hours JSON, maps_embed_url,
  track_require_phone BOOL,          -- lihat §6.3
  updated_at

rate_limits     id, bucket_key UNIQUE, count, window_start   -- kalau multi-node nanti
```

---

## 4. Alur Pre-Order (Detail Kritis)

### 4.1 Urutan langkah pelanggan

1. **Landing** — banner batch PO aktif + countdown tutup + progress kuota terpakai.
2. **Pilih menu** — dari `batch_items` yang `is_available = 1`. Keranjang disimpan di `localStorage` supaya tidak hilang saat refresh.
3. **Isi data pemesan** — nama, no. HP/WhatsApp (dinormalisasi), Telegram (opsional).
4. **Pilih pemenuhan**
   - `pickup`: tidak perlu alamat.
   - `delivery` / `cod`: wajib alamat + titik koordinat.
5. **Ambil titik peta** — tombol "Gunakan lokasi saya" memanggil `navigator.geolocation.getCurrentPosition({enableHighAccuracy: true, timeout: 15000, maximumAge: 0})`.
   - Tampilkan **akurasi dalam meter**; kalau > 100 m, minta user ambil ulang di luar ruangan.
   - Bisa juga geser pin manual di peta sebagai koreksi.
   - **Catatan penting: Geolocation API hanya jalan di HTTPS.** Wajib TLS di VPS.
6. **Pembayaran** — tampil QRIS toko + nomor rekening, lalu **upload bukti (wajib)**.
7. **Submit** → server memproses dalam **satu transaksi DB**.
8. **Halaman sukses** — Order ID (UUID) + short code, tombol salin, tombol simpan ke Telegram, tautan tracking.

### 4.2 Transaksi server saat submit

Karena bukti bayar baru terbit bersamaan dengan order, urutannya harus aman:

```
1. Validasi payload (zod) + validasi file (magic bytes, ukuran, dimensi)
2. Simpan file ke storage/tmp/uploads/<random>.jpg     (di luar public/)
3. sharp: re-encode -> WebP, strip EXIF, buat varian thumb/card/full
4. Buka transaksi DB:
   a. SELECT batch FOR UPDATE            -> pastikan batch masih 'open' & belum lewat close_at
   b. UPDATE batches SET quota_used = quota_used + 1
      WHERE id = ? AND quota_used + 1 <= quota_total      -> 0 rows = kuota habis, rollback
   c. Untuk tiap item:
      UPDATE batch_items SET stock_used = stock_used + ?
      WHERE id = ? AND (stock_total IS NULL OR stock_used + ? <= stock_total)
      -> 0 rows = stok kurang, rollback SEMUA
   d. INSERT orders (UUID, short_code, total, ...)
   e. INSERT order_items (snapshot harga)
   f. INSERT stock_movements (per item)
   g. INSERT order_status_history (NULL -> 'menunggu_verifikasi')
   h. INSERT audit_log
   COMMIT
5. Pindahkan file dari tmp -> storage/uploads/<tahun>/<bulan>/
6. Kirim notifikasi Telegram ke admin
7. Return UUID + short_code
```

**Kenapa `UPDATE ... WHERE stok masih cukup` bukan `SELECT` lalu `UPDATE`:** mencegah dua pembeli terakhir berebut stok yang sama (race condition). Ini kesalahan paling umum di sistem PO dan efeknya langsung terasa saat batch ramai.

**Idempotency:** client mengirim `idempotency_key` (UUID yang dibuat saat form dibuka). Kalau user menekan submit dua kali atau koneksi timeout lalu retry, unique constraint menolak duplikat dan server mengembalikan order yang sama.

**File orphan:** kalau transaksi gagal, file di `tmp/` disapu oleh scheduled task harian (> 24 jam).

### 4.3 Penanganan kuota & stok setelah order dibuat

| Kejadian | Aksi stok |
|---|---|
| Order dibuat | kuota & stok langsung terpakai (pesimistis) |
| Admin tolak bukti bayar | stok dikembalikan, status `ditolak`, pelanggan bisa upload ulang bukti -> kembali `menunggu_verifikasi` |
| Pelanggan/admin batalkan | stok dikembalikan, tercatat di `stock_movements` |
| Admin sesuaikan stok manual | tercatat sebagai `admin_adjust` |

Setiap perubahan stok **wajib** lewat `stock_movements`. Kalau tidak, sengketa "kenapa stok saya habis" tidak bisa ditelusuri.

### 4.4 COD — perlu keputusan

Kalau `allow_cod = 1`, apakah bukti bayar tetap wajib saat checkout? Dua opsi:

- **Opsi A (rekomendasi):** COD melewati upload bukti. `payment_status = 'unpaid'`, dibayar saat serah terima, admin menandai lunas. Bukti bersifat opsional.
- **Opsi B:** COD tetap wajib upload (mis. DP 50%) sebagai komitmen.

Ini masuk daftar pertanyaan terbuka (§11).

---

## 5. Halaman Tracking Mandiri

### 5.1 Rute

- `GET /track` — form input Order ID.
- `GET /track/[id]` — detail pesanan.

### 5.2 Input yang diterima

- UUID lengkap (`f47ac10b-58cc-4372-a567-0e02b2c3d479`), atau
- **Short code** (`MM-7K2P4Q`) — jauh lebih praktis untuk pelanggan yang mencatat di kertas atau membacakan lewat telepon.

Pencarian mencoba `id` dulu, lalu `short_code`.

### 5.3 Timeline status

Timeline stepper vertikal, ikon `lucide-solid`, stroke 1.5 px, tanpa emotikon:

| Status | Ikon |
|---|---|
| `menunggu_verifikasi` | `Clock` |
| `dikonfirmasi` | `BadgeCheck` |
| `diproduksi` | `ChefHat` |
| `siap_diambil` | `PackageCheck` |
| `dikirim` | `Truck` |
| `selesai` | `CheckCircle2` |
| `ditolak` / `dibatalkan` | `XCircle` (merah) |

### 5.4 Isi halaman

- Timeline + timestamp tiap perubahan (dari `order_status_history`).
- Rincian item, subtotal, ongkir, total.
- Titik koordinat + tombol `ExternalLink` "Buka di Google Maps".
- Thumbnail bukti bayar yang diunggah (bisa diklik untuk memperbesar).
- Catatan dari admin (kalau ada).
- Tombol "Hubungi Admin" via `wa.me` (pesan otomatis berisi short code) dan deep-link Telegram bot.

---

## 6. Dashboard Admin & CMS

### 6.1 Halaman

| Rute | Fungsi |
|---|---|
| `/admin/login` | Login (username + password, Argon2id) |
| `/admin` | Overview: omzet batch, order masuk, perlu verifikasi, kuota tersisa, grafik harian |
| `/admin/orders` | Tabel order: filter status/batch/tanggal, pencarian nama/HP/kode |
| `/admin/orders/[id]` | Detail: bukti bayar (zoom), peta titik antar, ubah status, catatan |
| `/admin/batches` | CRUD batch PO, buka/tutup, atur kuota & tanggal pengiriman |
| `/admin/batches/[id]/items` | Pilih menu yang dibuka di batch + stok & harga khusus |
| `/admin/menu` | CRUD katalog, galeri foto, kategori, toggle aktif |
| `/admin/production` | **Daftar produksi**: rekap qty per menu untuk satu batch, siap cetak |
| `/admin/export` | Ekspor order ke CSV/Excel (rekap + label pengiriman) |
| `/admin/settings` | QRIS, rekening, ongkir, COD/delivery, pengumuman, kontak |
| `/admin/audit` | Riwayat aksi admin (owner only) |

### 6.2 Fitur admin yang wajib ada (sering terlewat)

1. **Daftar Produksi** — UMKM tidak butuh grafik; mereka butuh *"batch ini harus bikin 45 Mol-Mol Original dan 30 Mol-Mol Coklat"*. Satu tombol cetak.
2. **Input order manual** — pesanan dari WA/telepon/datang langsung tetap harus masuk sistem. Kalau tidak, stok dan rekap tidak akurat.
3. **Ekspor CSV/Excel** — untuk label pengiriman dan rekap keuangan.
4. **Ganti status massal** — `dikonfirmasi` -> `diproduksi` untuk banyak order sekaligus.
5. **Ubah ongkir per order** — realitanya ongkir flat sering meleset untuk alamat jauh.
6. **Riwayat perubahan status** terlihat di detail order, termasuk *siapa* admin yang mengubah.
7. **Kuota override** — admin bisa menambah kuota batch tanpa mengedit ulang batch dari awal.

### 6.3 Keamanan akses

- Session **DB-backed** (tabel `admin_sessions`), bukan JWT stateless — supaya bisa dicabut paksa saat logout atau saat ada kebocoran.
- Cookie: `httpOnly`, `sameSite=lax`, `secure` (HTTPS), `path=/`, umur pendek + perpanjangan otomatis.
- CSRF token untuk semua mutasi admin.
- Rate limit login (mis. 5 percobaan / 15 menit per IP + per username).
- **Tracking & privasi:** UUID tidak bisa ditebak, tetapi siapa pun yang punya tautannya bisa melihat alamat lengkap. Mitigasi (pilih satu):
  - `track_require_phone = 1` -> selain Order ID, minta 4 digit terakhir nomor HP.
  - Atau: sembunyikan alamat lengkap di halaman tracking publik, tampilkan hanya kecamatan.
  - Rekomendasi: **terapkan yang pertama**, karena alamat lengkap memang perlu dikonfirmasi pelanggan.
- Rate limit endpoint tracking (mis. 20 permintaan / menit / IP) supaya tidak bisa dipakai brute-force.

---

## 7. Notifikasi Telegram

### 7.1 Untuk admin (wajib, fase awal)

Bot mengirim pesan ke grup/channel admin saat:
- Order baru masuk -> ringkasan: kode, nama, no HP, item, total, metode, tautan bukti bayar, tautan peta.
- Pelanggan mengunggah ulang bukti setelah ditolak.
- Batch PO akan tutup dalam 12 jam.
- Stok salah satu menu hampir habis.

Implementasi: `sendMessage` ke `settings.admin_telegram_chat_id`, dengan `parse_mode: 'HTML'` dan `disable_web_page_preview`.

Webhook route `/api/telegram/webhook` diverifikasi lewat header `X-Telegram-Bot-Api-Secret-Token`.

### 7.2 Untuk pelanggan (deep-link, opsional tapi elegan)

Masalahnya: bot Telegram **tidak bisa** mengirim pesan ke pengguna yang belum pernah memulai percakapan dengannya. Solusinya deep-link:

```
Halaman sukses  ->  tombol "Pantau via Telegram"
                ->  https://t.me/<BotMolMol>?start=<uuid_order>
Bot menerima /start <uuid>
                ->  INSERT telegram_subscriptions (order_id, chat_id)
                ->  balas: "Terima kasih, kami akan kabari setiap perubahan status pesanan MM-7K2P4Q."
Setiap status berubah
                ->  push ke semua chat_id yang subscribe order tersebut
```

Ini memberi notifikasi otomatis ke pelanggan **tanpa biaya** dan tanpa perlu akun. Tidak ada alasan memakai gateway WhatsApp berbayar untuk kebutuhan ini.

Perintah bot yang berguna: `/start <uuid>`, `/status` (daftar pesanan yang disubscribe), `/stop <uuid>`.

---

## 8. Arah Desain (Menghindari "AI Slop")

### 8.1 Pola yang dilarang

- Gradien ungu ke biru, `bg-gradient-to-r from-indigo-500 to-purple-600`.
- `rounded-3xl` seragam di semua elemen + shadow blur besar (`shadow-2xl`).
- Glassmorphism (kaca buram) di mana-mana.
- Grid 3 kolom ikon-in-circle dengan judul + deskripsi generik ("Cepat", "Aman", "Terpercaya").
- Emoji sebagai ikon. **Gunakan `lucide-solid` dengan stroke width konsisten 1.5.**
- Teks puitis kosong: "Solusi terbaik untuk kebutuhan Anda".
- Font default tanpa hierarki (semuanya Inter 16 px).

### 8.2 Arah yang dituju

**Prinsip:** ini toko makanan rumahan di Purwokerto, bukan startup SaaS. Tampilannya harus terasa hangat, jujur, dan "dibuat manusia" — bukan template.

| Aspek | Keputusan |
|---|---|
| Warna | Palet turunan dari logo Mol-Mol (perlu dikonfirmasi). Basis netral hangat (kertas `#FAF7F2`, tinta `#1C1917`), 1 warna brand + 1 aksen. Hindari hitam/putih murni. |
| Tipografi | Satu font display berkarakter untuk judul (mis. Fraunces / Bricolage Grotesque) + satu sans netral untuk body (mis. Plus Jakarta Sans). Skala tipe kontras tinggi, bukan seragam. |
| Radius | 8–12 px. Bukan 24 px ke atas. |
| Border | Hairline 1 px sebagai pemisah utama, bukan shadow. |
| Foto | **Pahlawan utama.** Kartu produk rasio 4:5, foto asli produk, harga besar dan tebal. Ini yang membuat terasa seperti marketplace, bukan landing page. |
| Layout | Grid asimetris, sedikit overlap, ruang kosong lega. Hindari segalanya center-aligned. |
| Detail | Shadow tajam ber-offset (bukan blur), tekstur grain halus opsional, underline dekoratif pada heading. |
| Mobile | Mobile-first. Pelanggan memesan dari HP. **Sticky cart bar** di bawah dengan jumlah item + total. Target tap minimal 44×44 px. |
| Motion | Halus & cepat (150–250 ms). Skeleton loader saat memuat. Tanpa animasi berlebihan. |

### 8.3 Halaman yang perlu desain khusus

1. **Kartu produk** — foto dominan, badge kuota ("Sisa 12"), harga tebal, tombol tambah besar.
2. **Indicator kuota batch** — progress bar tipis + teks "37 dari 50 slot terisi", bukan donut chart.
3. **Halaman sukses** — ini momen paling penting. Kartu Order ID besar, tombol salin jelas, instruksi lanjutan. Jangan hanya toast.
4. **Timeline tracking** — garis vertikal dengan simpul status, jelas terbaca di HP.
5. **Form GPS** — peta mini + indikator akurasi. Harus terasa tenang, karena ini bagian paling rawan ditinggalkan pengguna.

---

## 9. Rencana Implementasi Bertahap

### Fase 0 — Fondasi (½ hari)
- Pasang dependensi, konfigurasi `.env` (`.env.example` ikut di-commit).
- Koneksi MySQL + Drizzle, uji koneksi.
- Design token di `app.css` (warna, tipografi, radius, spacing).
- Komponen UI dasar: Button, Input, Field, Card, Badge, Dialog, Toast, Skeleton.
- Helper `formatRupiah`, `formatTanggalWIB`, `normalizePhone`.

**Selesai bila:** `npm run dev` jalan, halaman contoh memakai token & komponen dasar.

### Fase 1 — Skema & Migrasi (½ hari)
- Tulis seluruh `schema.ts`, generate & jalankan migrasi.
- Seeder: 1 admin, 1 batch contoh, 3 menu contoh.
- Skrip `db:seed` idempoten.

**Selesai bila:** semua tabel terbentuk, seeder bisa dijalankan berulang tanpa error.

### Fase 2 — Logika Bisnis Murni + Test (1 hari)
- `lib/pricing.ts`: subtotal, ongkir (flat + gratis ongkir minimum), diskon, pembulatan.
- `lib/validation.ts`: skema zod (order, GPS, upload, login, batch, menu).
- `lib/services/stock.ts`: reservasi & pelepasan stok dengan transaksi.
- Tes vitest untuk ketiga modul di atas — termasuk kasus stok terakhir diperebutkan.

**Selesai bila:** test hijau, termasuk test konkurensi stok.

### Fase 3 — Landing & Katalog (1–1½ hari)
- Header, hero batch, countdown, progress kuota.
- Grid katalog dari `batch_items`.
- Keranjang `localStorage` + sticky cart bar mobile.
- Halaman detail produk + galeri.

**Selesai bila:** katalog tampil dari DB, keranjang bertahan setelah refresh.

### Fase 4 — Checkout, GPS & Upload Bukti (2 hari)
- Form data pemesan + validasi realtime.
- Pemilih lokasi: GPS perangkat / geser pin di peta / input manual.
- Panel pembayaran QRIS + rekening.
- Upload bukti dengan preview, progress, dan validasi (tipe, ukuran, dimensi).
- Handler server transaksional (§4.2) + idempotency.
- Halaman sukses + salin Order ID.

**Selesai bila:** satu order lengkap tersimpan dengan bukti bayar, UUID & short code terbit, kuota berkurang tepat 1.

### Fase 5 — Tracking (1 hari)
- Form `/track`, halaman `/track/[id]`, timeline, peta, tombol hubungi admin.

**Selesai bila:** status berubah di DB -> tampil di halaman tracking.

### Fase 6 — Auth & Dashboard Admin (2 hari)
- Login, session DB, guard route, middleware proteksi `/admin/*`.
- Overview, tabel order, detail order, ubah status + catatan.
- Daftar produksi + ekspor CSV.

**Selesai bila:** admin bisa memproses order dari masuk sampai selesai tanpa menyentuh DB.

### Fase 7 — CMS (2 hari)
- CRUD menu + galeri foto + kategori.
- CRUD batch + pemilihan menu per batch + stok/harga khusus.
- Pengaturan toko (QRIS, rekening, ongkir, COD, pengumuman).
- Upload & pengelolaan media + hapus file yatim.

**Selesai bila:** admin bisa membuka batch PO baru lengkap dengan menu dan kuota, tanpa developer.

### Fase 8 — Telegram (1 hari)
- Bot admin: order baru, bukti diunggah ulang, batch hampir tutup.
- Webhook + verifikasi secret token.
- Deep-link subscribe status untuk pelanggan.

**Selesai bila:** order baru muncul di grup Telegram < 3 detik; pelanggan yang subscribe menerima perubahan status.

### Fase 9 — Poles & Kualitas (1 hari)
- Aksesibilitas: kontras AA, navigasi keyboard, label form, `aria-live` untuk perubahan status.
- SEO: meta per halaman, Open Graph (penting untuk share ke grup WA/IG), `sitemap.xml`, JSON-LD `LocalBusiness` + `Product`.
- Performa: gambar WebP responsif, `loading="lazy"`, audit Lighthouse target >= 90 di mobile.
- Halaman statis: Syarat & Ketentuan PO, Kebijakan Pembatalan, Kontak.

### Fase 10 — Deploy VPS (1 hari)
- `npm run build`, jalankan via PM2 atau systemd dengan auto-restart.
- Nginx reverse proxy + Certbot TLS (**wajib**, karena GPS butuh HTTPS).
- MySQL: user khusus aplikasi (bukan root), `bind-address` lokal, firewall.
- Backup otomatis harian: `mysqldump` + `rsync` folder `storage/`, retensi 14 hari.
- Log rotation, monitoring uptime, `.env` permission 600.

**Selesai bila:** situs jalan di domain dengan HTTPS, GPS berfungsi di HP, backup terbukti bisa dipulihkan.

**Total estimasi: ~13–15 hari kerja** untuk satu orang.

---

## 10. Saran Tambahan yang Saya Rekomendasikan

Diurutkan berdasarkan rasio manfaat/usaha:

**Tinggi**
1. **Short code di samping UUID.** UUID 36 karakter tidak akan diingat pelanggan. `MM-7K2P4Q` bisa ditulis di kertas, dibacakan via telepon, dan dicari admin. UUID tetap jadi kunci kanonik.
2. **Snapshot harga & nama di `order_items`.** Harga menu akan berubah. Tanpa snapshot, riwayat pesanan lama jadi salah.
3. **Reservasi stok atomik + audit `stock_movements`.** Mencegah oversell dan menyelesaikan sengketa stok.
4. **Halaman Daftar Produksi yang bisa dicetak.** Ini yang benar-benar dipakai UMKM setiap hari.
5. **Input order manual oleh admin.** Pesanan dari WA/telepon tetap harus masuk sistem.
6. **`mysqldump` harian otomatis + simpan salinan di luar VPS.** Satu-satunya hal yang tidak bisa diperbaiki kalau hilang.
7. **Re-encode gambar dengan `sharp` dan strip EXIF.** Mengecilkan file drastis dan menghapus metadata GPS perangkat pelanggan dari foto bukti bayar — ini masalah privasi yang nyata.

**Sedang**
8. **Ekspor CSV/Excel** untuk label pengiriman dan rekap keuangan.
9. **Idempotency key** pada submit order.
10. **Storage di luar `public/`, disajikan lewat route handler.** Mencegah file yang diunggah dieksekusi atau disalahgunakan.
11. **Rate limit** pada pembuatan order, login, dan pencarian tracking.
12. **Countdown tutup PO yang jelas** + pengingat Telegram 12 jam sebelum tutup.
13. **Badge "Sisa N" pada produk** yang stoknya menipis (< 20% kuota).
14. **Halaman Syarat PO & Kebijakan Pembatalan.** Menghindari konflik dengan pelanggan.
15. **Logging terstruktur (`pino`)** + pencatatan error, supaya bisa debug dari VPS.

**Rendah / nanti**
16. Analytics ringan self-host (Umami) — lebih baik daripada Google Analytics untuk UMKM.
17. Multi-bahasa (ID/EN) — belum perlu kalau pasar lokal.
18. Payment gateway (Midtrans/Xendit) untuk verifikasi otomatis — mahal dan rumit; QRIS statis + verifikasi manual sudah memadai untuk skala UMKM.
19. PWA installable + offline catalog — menarik, tapi bukan prioritas.
20. Fitur ulasan/testimoni pelanggan setelah order selesai.

---

## 11. Pertanyaan Terbuka (Perlu Validasi)

1. **Brand & visual:** warna logo Mol-Mol apa? Kategori produknya apa (kue basah / bolu / frozen food / minuman)? Ini menentukan palet dan pemilihan foto.
2. **COD:** kalau COD diaktifkan, apakah bukti bayar tetap wajib saat checkout? (lihat §4.4 — rekomendasi: tidak wajib)
3. **Ongkir:** benar-benar flat, atau perlu tarif per zona/kecamatan di Purwokerto? Ada batas jarak maksimum?
4. **Multi-batch:** boleh ada dua batch PO terbuka bersamaan, atau hanya satu aktif? (rekomendasi: satu aktif — jauh lebih sederhana)
5. **Akun pelanggan:** perlu login pelanggan, atau cukup Order ID? (rekomendasi: tidak perlu login)
6. **Google Maps API key:** tersedia? Kalau tidak, saya sarankan peta alternatif (Leaflet + OpenStreetMap + geocoding Nominatim) yang gratis tanpa API key. Kalau ada, pakai Maps JS API + Places Autocomplete.
7. **Produk ready stock:** apakah ada produk non-PO yang bisa dibeli langsung, atau semuanya selalu lewat batch PO?
8. **Foto produk:** sudah tersedia foto berkualitas, atau perlu rencana sesi foto? Ini penentu terbesar kesan "marketplace" vs "template".
9. **Nama bot Telegram** dan **grup/chat ID admin** untuk notifikasi.
10. **Domain:** sudah ada? (untuk konfigurasi Nginx + TLS)
11. **Pengiriman:** pakai kurir sendiri, atau ada kerja sama ekspedisi/JNE?
12. **Rekap biaya:** apakah dashboard perlu rekap biaya produksi, atau cukup omzet saja?

---

## 12. Verifikasi & Definisi Selesai

**Test otomatis**
- Unit: perhitungan harga (termasuk gratis ongkir & pembulatan), validasi zod, reservasi stok.
- Unit: **test konkurensi** — 5 order bersamaan untuk 1 slot stok terakhir -> tepat 1 berhasil.
- Unit: transisi status order (termasuk pemulihan stok saat dibatalkan).
- E2E Playwright: alur PO lengkap dari katalog -> daftar produksi admin.
- E2E: pelanggan menemukan pesanannya lewat `/track`, status berubah setelah admin mengubahnya.

**Manual**
- GPS di HP Android & iOS di lapangan, akurasi wajar (< 50 m).
- Upload foto 8 MB dari kamera HP -> berhasil dikompres & tersimpan.
- Semua halaman diuji pada lebar 360 px.
- Akses `/admin/*` tanpa sesi -> dialihkan ke login.
- Pemulihan backup diuji di database bersih, bukan hanya memastikan file backup terbentuk.

---

## 13. Catatan Risiko

| Risiko | Mitigasi |
|---|---|
| Stok tidak sinkron saat batch ramai | Transaksi + conditional `UPDATE`, test konkurensi |
| Order "hantu" (spam) karena order langsung terbuat | Wajib bukti bayar saat checkout + verifikasi manual admin + rate limit per IP/nomor HP |
| Sengketa "saya sudah bayar" | Bukti bayar tersimpan permanen + audit `order_status_history` |
| Foto bukti palsu / tidak terbaca | Admin menolak -> status `ditolak` -> pelanggan unggah ulang; stok dikembalikan |
| Server mati saat jam tutup PO | Job penutup batch otomatis + notifikasi Telegram; kuota tetap dijaga constraint DB |
| Data hilang karena VPS rusak | `mysqldump` harian + salinan di luar VPS + uji pemulihan |
| GPS tidak jalan | Hanya jalan via HTTPS, dan pengguna bisa menolak izin -> selalu sediakan opsi input alamat manual |
| Harga berubah setelah pelanggan memesan | Snapshot harga di `order_items` |
