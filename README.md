# Mol-Mol Purwokerto — Sistem Pre-Order Berkala

> **Aplikasi Web Pre-Order Berkala UMKM Kuliner**  
> Didesain khusus untuk operasional **Mol-Mol Purwokerto** ([@molmol.purwokerto](https://www.instagram.com/molmol.purwokerto/)) — *Dessert & Cemilan Purwokerto*.

---

## 📌 Gambaran Umum

**Mol-Mol Purwokerto** menerapkan model bisnis pre-order (PO) terjadwal per gelombang (*batch*) untuk memastikan seluruh varian camilan manis dan gurih diproduksi secara higienis, berkualitas tinggi, dan selalu segar saat diterima oleh pelanggan di wilayah Purwokerto dan sekitarnya.

Aplikasi ini mencakup sisi **Etalase Pelanggan (Storefront)** yang cepat, responsif di semua perangkat (desktop & mobile), serta **Panel Manajemen Toko (Admin CMS)** yang terintegrasi langsung dengan database MySQL dan bot notifikasi Telegram otomatis.

---

## 🚀 Fitur Utama

### 1. Etalase & Katalog Pre-Order
- **Multi-Batch PO Aktif**: Dukungan multi-gelombang PO dengan pemilih gelombang interaktif (jadwal batas tutup PO, tanggal pengiriman, dan kuota slot otomatis).
- **Katalog Varian Produk**: Menampilkan daftar camilan dengan foto multi-gambar (hingga 4 foto), carousel interaktif, modal lightbox resolusi tinggi, informasi berat per porsi, dan harga master.
- **Keranjang Reaktif & Sticky Cart Bar**: Keranjang belanja tersimpan lokal (*client persistence*) dengan batas maksimal pemesanan per batch.

### 2. Formulir Checkout Step-by-Step
- **Step 1 (Data Pemesan)**: Nama lengkap, validasi nomor WhatsApp aktif (normalisasi standar Indonesia `628...`), dan username Telegram opsional.
- **Step 2 (Pengiriman & Pembayaran)**:
  - Pilihan metode: **Ambil di Tempat (Pickup)**, **Diantar Kurir (Delivery)**, atau **COD (Bayar di Tempat)**.
  - Untuk metode Pickup: Menampilkan alamat outlet toko, jam operasional pengambilan, dan tautan koordinat presisi Google Maps.
  - Untuk metode Delivery/COD: Input alamat pengiriman dilengkapi fitur **"Gunakan Lokasi Saya" (GPS)** yang otomatis melakukan *reverse-geocoding* alamat jalan dan kelurahan/kecamatan.
- **Pembayaran QRIS & Multi-Rekening**: Menampilkan barcode QRIS resmi toko dan pilihan nomor rekening bank tujuan transfer (BCA, Mandiri, dll.) dengan fitur salin nomor rekening satu-klik.
- **Upload Bukti Pembayaran**: Unggah bukti transfer/struk QRIS langsung dari perangkat.

### 3. Pelacakan Pesanan Real-Time (`/track`)
- Pencarian status pesanan menggunakan **Kode Pesanan (Short Code)** contoh: `MM-7K2P4Q` atau UUID pesanan.
- Menampilkan rincian pesanan, garis waktu status (*Menunggu Verifikasi*, *Dikonfirmasi*, *Sedang Diproduksi*, *Siap Diambil/Dikirim*, *Selesai*), alamat pengantaran/titik pickup toko, dan tombol kontak WhatsApp admin.

### 4. Panel Administrasi Toko (`/admin`)
- **Autentikasi Cepat & Aman**: Login admin terproteksi cookie HTTP-only dengan sistem *in-memory cache* server untuk verifikasi instan tanpa lag.
- **Overview Penjualan**: Rekap metrik omzet batch berjalan, total pesanan masuk, pesanan menunggu verifikasi bukti bayar, dan sisa kuota batch.
- **Manajemen Pesanan (`/admin/orders`)**: Filter status, pencarian order, inspeksi foto bukti bayar, verifikasi pesanan, dan pencatatan nota admin.
- **Manajemen Batch PO (`/admin/batches`)**: Buka batch PO baru atau edit batch yang ada (pengaturan tanggal, kuota, ongkir flat, gratis ongkir, status, metode yang diizinkan: pickup/delivery/COD, serta alamat dan titik koordinat pengambilan).
- **Katalog Menu (`/admin/menu`)**: Tambah, edit, dan kelola menu (SKU, nama, deskripsi, harga, berat, status ketersediaan, serta upload hingga 4 foto per menu).
- **Rekap Produksi (`/admin/production`)**: Rekap total porsi varian menu yang wajib diproduksi untuk batch tertentu, siap dicetak (*print view*) dan diekspor ke format CSV.
- **Pengaturan Toko CMS (`/admin/settings`)**: Ubah identitas toko, nomor WhatsApp, alamat & titik koordinat outlet pengambilan, tambah/hapus banyak nomor rekening bank/e-wallet, upload barcode QRIS, pengumuman promo, dan Telegram Chat ID.

### 5. Integrasi Bot Telegram
- **Keyboard Menu Interaktif**: Tombol menu siap pakai di Telegram: `/stok`, `/order`, `/pembelian`, `/status`, `/help`.
- **Notifikasi Admin Otomatis**: Pesanan baru langsung dikirimkan ke Telegram Admin lengkap dengan rincian menu, nomor kontak pelanggan, metode pengantaran, dan bukti transfer.
- **Notifikasi Pelanggan**: Update status pesanan otomatis dikirimkan ke chat Telegram pembeli yang berlangganan melalui tautan kode pesanan.

### 6. Desain Editorial & Mobile Responsive
- Dibuat dengan prinsip editorial minimalis modern: font display *General Sans*, body *DM Sans*, dan font monospace *JetBrains Mono*.
- Tampilan responsif di semua resolusi desktop, tablet, dan smartphone dengan scrollbar minimalis yang menyatu dengan latar belakang.
- Dilengkapi metadata SEO, Open Graph, Twitter Cards, dan JSON-LD Schema `Bakery / LocalBusiness` terhubung dengan akun resmi [@molmol.purwokerto](https://www.instagram.com/molmol.purwokerto/).

---

## 🛠️ Tech Stack

| Komponen | Teknologi |
|---|---|
| **Framework Frontend** | [SolidJS](https://www.solidjs.com/) & [SolidStart](https://start.solidjs.com/) |
| **Styling & CSS** | [Tailwind CSS v4](https://tailwindcss.com/) |
| **Server Engine** | [Nitro Engine](https://nitro.unjs.io/) |
| **Database** | MySQL (MySQL 8.0+) |
| **ORM & Schema** | [Drizzle ORM](https://orm.drizzle.team/) & Drizzle Kit |
| **Validasi Data** | [Zod](https://zod.dev/) |
| **Ikonografi** | [Lucide Solid](https://lucide.dev/) |
| **Pengujian** | [Vitest](https://vitest.dev/) & [Playwright](https://playwright.dev/) |
| **Manajemen Paket** | [pnpm](https://pnpm.io/) |

---

## 📦 Instalasi & Menjalankan Proyek

### 1. Prasyarat
- Node.js versi 20 atau lebih baru (direkomendasikan Node.js v24 LTS).
- Database MySQL aktif.
- Package manager `pnpm`.

### 2. Kloning & Pemasangan Dependensi
```bash
git clone https://github.com/aulky/solid-molmolpwt.git
cd solid-molmolpwt
pnpm install
```

### 3. Konfigurasi Lingkungan (`.env`)
Salin file contoh konfigurasi:
```bash
cp .env.example .env
```
Sesuaikan kredensial koneksi database MySQL dan token bot Telegram pada `.env`:
```env
PORT=3001
BASE_URL="http://localhost:3001"

# Database MySQL
DATABASE_URL="mysql://root:password@127.0.0.1:3306/molmol_db"
DB_HOST="127.0.0.1"
DB_PORT=3306
DB_USER="root"
DB_PASSWORD="password"
DB_NAME="molmol_db"

# Kredensial Default Admin
DEFAULT_ADMIN_USERNAME="admin"
DEFAULT_ADMIN_PASSWORD="AdminMolMolPurwokerto2026!"
DEFAULT_ADMIN_NAME="Owner Mol-Mol"

# Bot Telegram (Opsional untuk testing lokal)
TELEGRAM_BOT_TOKEN=""
TELEGRAM_ADMIN_CHAT_ID=""
```

### 4. Setup Database
```bash
# Sinkronkan skema tabel ke database MySQL
pnpm db:push

# Isi database dengan data awal (menu default, batch PO aktif, dan pengaturan toko)
pnpm db:seed
```

### 5. Menjalankan Aplikasi
```bash
# Jalankan mode development
pnpm dev

# Atau jalankan build dan preview produksi
pnpm build
pnpm start
```
Buka browser di `http://localhost:3001`.

---

## 🔑 Kredensial Login Admin

- **URL Login**: `http://localhost:3001/admin/login`
- **Username Default**: `admin`
- **Password Default**: `admin123` *(atau `AdminMolMolPurwokerto2026!` sesuai `.env`)*

Untuk mengubah password admin langsung lewat terminal:
```bash
pnpm db:set-password <password_baru>
```

---

## 🗄️ Perintah Manajemen Database (CLI Scripts)

Proyek ini telah dilengkapi script siap pakai untuk memudahkan operasional dan pengujian:

| Perintah | Deskripsi |
|---|---|
| `pnpm db:init` | Menginisialisasi seluruh 13 tabel database & data awal (Aman untuk MariaDB & MySQL) |
| `pnpm db:push` | Menerapkan perubahan skema Drizzle langsung ke database |
| `pnpm db:seed` | Mengisi data awal (pengaturan toko, menu, batch PO, dan admin) |
| `pnpm db:set-password <pass>` | Menyetel / mengubah kata sandi akun admin secara instan |
| `pnpm db:clear:orders` | Mengosongkan data transaksi & order saja (tanpa menghapus menu/PO) |
| `pnpm db:clear` | Mengosongkan seluruh tabel database |
| `pnpm db:reset` | Mengosongkan seluruh database lalu mengisi kembali data awal |
| `pnpm db:reset:admin-only` | Mengosongkan seluruh data transaksi & PO, **hanya menyisakan akun admin default** untuk memulai toko dari nol |

---

## 🧪 Pengujian Otomatis

Jalankan pengujian unit dan integrasi dengan Vitest:
```bash
pnpm test
```

---

## 📂 Struktur Proyek

```
solid-molmolpwt/
├── public/
│   ├── images/               # Aset gambar & ilustrasi
│   └── uploads/              # Direktori upload (menu, bukti bayar, QRIS)
├── scripts/
│   ├── set-admin-password.ts # Script set password admin
│   ├── clear-db.ts           # Script truncate data database
│   └── reset-admin-only.ts   # Script reset total menyisakan akun admin
├── src/
│   ├── app.css               # Styling Tailwind v4 & komponen tema
│   ├── app.tsx               # Root component & routing layout
│   ├── entry-client.tsx      # Client entrypoint
│   ├── entry-server.tsx      # Server entrypoint & HTML SEO metadata
│   ├── components/
│   │   ├── Nav.tsx           # Navigasi utama
│   │   ├── admin/            # Komponen panel admin (Layout, StatCard)
│   │   ├── catalog/          # Komponen etalase (BatchHero, ProductCard, QtyStepper)
│   │   ├── checkout/         # Komponen checkout, GPS picker & upload bukti
│   │   ├── tracking/         # Komponen pelacakan & timeline order
│   │   └── ui/               # Komponen UI modal & badge
│   ├── lib/
│   │   ├── auth.ts           # Logika sesi, password hashing, memory cache
│   │   ├── pricing.ts        # Kalkulasi harga, diskon, ongkir & format rupiah
│   │   ├── storage.ts        # Handler upload file lokal
│   │   ├── telegram.ts       # Integrasi Telegram Bot API
│   │   ├── validation.ts     # Skema validasi Zod
│   │   ├── db/               # Inisialisasi DB, skema Drizzle & seeder
│   │   └── services/         # Layanan bisnis (batch, menu, order, settings, stock)
│   └── routes/
│       ├── index.tsx         # Halaman utama (Katalog PO & Checkout)
│       ├── terms.tsx         # Kebijakan & Syarat Pre-Order
│       ├── track/            # Halaman pencarian & detail pelacakan pesanan
│       ├── admin/            # Halaman panel admin (Dashboard, Orders, Batches, Menu, Production, Settings, Login)
│       └── api/              # API endpoints (Checkout, Upload, Admin API, Telegram Webhook, Geocode)
└── test/                     # File pengujian unit & integrasi
```

---

## 📄 Lisensi & Hak Cipta

Dibuat untuk sistem operasional **Mol-Mol Purwokerto** ([@molmol.purwokerto](https://www.instagram.com/molmol.purwokerto/)).  
Hak cipta dilindungi.
