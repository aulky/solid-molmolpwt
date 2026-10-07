# UI Revision Notes — Mol-Mol Purwokerto

## Design Direction

Pertahankan karakter visual Mol-Mol yang sudah ada: **warm, creamy, friendly, dan cocok untuk produk makanan/camilan**.

Revisi tidak perlu mengubah konsep menjadi merah-putih. Fokus utama adalah **merapikan penggunaan warna, hierarchy, spacing, dan konsistensi komponen** agar tampilan lebih nyaman dilihat dan lebih user-friendly.

Arah visual yang disarankan:

- **Warm Cream** sebagai background utama
- **Ivory / Soft Beige** untuk card dan section
- **Mol-Mol Red** sebagai primary brand color dan CTA
- **Cocoa Brown** untuk teks utama dan elemen gelap
- **Caramel / Muted Amber** sebagai aksen hangat
- **Muted Sage Green** hanya untuk status aktif / sukses
- **Dark Cocoa** untuk footer

Contoh palet:

| Fungsi | Warna |
|---|---|
| Main Background | `#FFF4DE` |
| Secondary Background | `#F9EEDB` |
| Card / Surface | `#FFFDF8` |
| Primary Red | `#D92D3A` |
| Dark Red | `#B92230` |
| Main Text / Cocoa | `#5B4638` |
| Secondary Text | `#806B5C` |
| Caramel Accent | `#E9B45B` |
| Sage Green | `#7FA37A` |
| Border | `#E7D8C3` |
| Footer / Dark Cocoa | `#241D19` |

---

## 1. Color Balance

- Jangan membuat merah mendominasi seluruh halaman.
- Merah tetap menjadi warna brand utama, tetapi digunakan terutama pada:
  - CTA
  - Active navigation
  - Important label
  - Highlight tertentu
- Cream, beige, dan ivory tetap menjadi warna dominan pada keseluruhan halaman.
- Gunakan cocoa brown untuk teks agar terasa lebih hangat dibandingkan hitam pekat.
- Hijau hanya digunakan pada informasi positif seperti:
  - Pre-order aktif
  - Success state
  - Status tersedia
- Hindari terlalu banyak warna pastel yang berbeda dalam satu section.
- Jangan menggunakan pink, hijau, kuning, abu-abu, dan merah sekaligus dengan level visual yang sama.

---

## 2. Background

- Background yang sekarang sudah sesuai dengan karakter brand, sehingga tidak perlu diganti menjadi putih.
- Gunakan **warm cream** sebagai main background.
- Pastikan cream tidak terlalu kuning atau terlalu saturated.
- Gunakan variasi cream yang sangat halus untuk membedakan antar-section.
- Card sebaiknya menggunakan **ivory atau cream sangat muda**, bukan pure white.

Contoh:

```css
body {
  background: #FFF4DE;
}

.card {
  background: #FFFDF8;
}
```

---

## 3. Hero / Pre-Order Information

- Pertahankan hero section dengan bentuk card besar.
- Jangan membuat hero terlalu penuh dengan warna yang berbeda.
- Judul **“Pre-Order Spesial Batch Oktober 2026”** harus menjadi fokus utama.
- Informasi pendukung dibuat lebih subtle.
- Badge dapat menggunakan background cream/beige dengan border tipis.

Pembagian warna yang disarankan:

- Pre-order aktif → muted sage green
- Gratis ongkir → soft red / blush
- Sisa slot → light caramel
- Deadline → soft red tint
- Jadwal pengiriman → soft sage tint
- Metode pengiriman → light cream / caramel tint

Gunakan tint yang sangat lembut supaya ketiga info card tetap terasa sebagai satu keluarga visual.

---

## 4. Navigation

- Pertahankan navbar dengan background cream.
- Active menu **Pre-Order** tetap merah.
- Menu lain menggunakan cocoa brown / neutral brown.
- Jangan membuat semua menu memiliki warna gelap yang terlalu kuat.
- Tombol login cukup menggunakan:
  - border beige
  - cream/ivory background
  - cocoa text

Tujuannya supaya tombol login tidak bersaing dengan CTA Pre-Order.

---

## 5. Order Step Section

Section langkah pemesanan tetap menggunakan 3 langkah:

1. Pilih Menu Favorit
2. Alamat / Titik GPS
3. Bayar & Lacak Order

Revisi:

- Gunakan satu warna visual system.
- Nomor step dapat menggunakan light red circle.
- Icon menggunakan primary red.
- Teks utama menggunakan dark cocoa.
- Deskripsi menggunakan secondary brown.
- Jangan memakai warna hijau pada step terakhir jika belum menunjukkan completed state.
- Jika step hanya berupa penjelasan alur, ketiganya sebaiknya memiliki treatment visual yang sama.

---

## 6. Product Cards

Card produk adalah area utama setelah hero, sehingga perlu dibuat lebih clean.

Pertahankan:

- Foto produk besar
- Nama produk
- Deskripsi singkat
- Berat produk
- Harga
- Tombol Pesan

Revisi:

- Background card: ivory / warm white.
- Gunakan border beige sangat tipis.
- Shadow lembut.
- Jangan gunakan terlalu banyak warna di dalam card.
- Nama produk menggunakan dark cocoa.
- Harga dapat menggunakan primary red supaya mudah ditemukan.
- Tombol **+ Pesan** menggunakan Mol-Mol Red.
- Berat produk cukup menggunakan badge dark cocoa / muted brown.

Contoh hierarchy:

```text
[ Product Image ]

Mol-Mol Original Wijen
Deskripsi produk singkat...

250g

Harga
Rp 20.000        [+ Pesan]
```

---

## 7. Product Images

- Visual produk perlu menjadi focal point.
- Gunakan foto produk yang konsisten dari sisi:
  - angle
  - lighting
  - background
  - crop
- Hindari background card yang memiliki warna terlalu berbeda antar-produk.
- Image area dapat menggunakan:
  - warm ivory
  - soft beige
  - subtle cream gradient

Bukan warna abu-abu atau putih dingin.

---

## 8. CTA — “+ Pesan”

CTA utama tetap menggunakan merah karena sesuai identitas Mol-Mol.

Gunakan:

```css
background: #D92D3A;
color: #FFFDF8;
```

Hover:

```css
background: #B92230;
```

Pastikan seluruh tombol memiliki:

- tinggi sama
- padding sama
- radius sama
- ukuran font sama
- icon yang sama

Jangan menggunakan gradient atau warna tambahan yang membuat tombol terlalu ramai.

---

## 9. Typography

Gunakan hierarchy yang lebih konsisten.

### Heading
- Dark cocoa / almost black brown
- Bold
- Jangan terlalu banyak warna

### Body
- Cocoa brown
- Medium contrast

### Caption
- Muted brown

Hindari:

- text gray dingin
- brown terlalu muda di atas cream
- terlalu banyak jenis font weight

Gunakan maksimal:

- Bold
- Semi Bold
- Regular

---

## 10. Borders & Shadows

Jangan terlalu banyak outline berbeda.

Gunakan sistem konsisten:

```css
border: 1px solid #E7D8C3;
border-radius: 16px;
```

Shadow:

```css
box-shadow: 0 6px 18px rgba(91, 70, 56, 0.08);
```

Shadow menggunakan tone brown, bukan black shadow yang terlalu berat.

---

## 11. Progress Kuota

Informasi:

**4 / 50 Slot Terisi (8%)**

sudah cukup jelas.

Revisi:

- Background progress bar: beige.
- Filled progress: Mol-Mol Red.
- Jangan gunakan warna tambahan.
- “Sisa 46 Slot” dapat menggunakan caramel accent.

Contoh:

```css
.progress-track {
  background: #EADCC8;
}

.progress-fill {
  background: #D92D3A;
}
```

---

## 12. Spacing

Perlu menambah breathing room pada beberapa area.

Tambahkan jarak lebih jelas antara:

- Navbar dan hero
- Hero dan order steps
- Order steps dan katalog
- Product cards dan footer

Jangan memperbesar semua jarak secara berlebihan. Fokus pada konsistensi.

Gunakan spacing system seperti:

```text
8px
12px
16px
24px
32px
48px
```

---

## 13. Footer

Footer hitam pada desain sekarang terasa terlalu keras dibandingkan keseluruhan halaman yang warm.

Ganti menjadi **dark cocoa**, misalnya:

```css
background: #241D19;
```

Text:

```css
primary text: #FFF4DE;
secondary text: #CDBCA9;
```

Accent merah tetap dapat digunakan untuk icon atau link tertentu.

Dengan begitu footer tetap memiliki contrast tinggi, tetapi masih menyatu dengan palette utama.

---

## 14. Status Colors

Gunakan warna berdasarkan fungsi, bukan dekorasi.

### Primary Action
Mol-Mol Red

```text
#D92D3A
```

### Success / Active
Muted Sage

```text
#7FA37A
```

### Warning / Limited Slot
Caramel

```text
#E9B45B
```

### Neutral Information
Beige / Cocoa

```text
#E7D8C3
#5B4638
```

Jangan menambah warna baru jika tidak dibutuhkan.

---

## 15. Overall UX Priority

Tampilan harus membantu user melakukan tiga hal utama dengan cepat:

1. Mengetahui status dan informasi pre-order.
2. Melihat dan membandingkan produk.
3. Melakukan pemesanan.

Karena itu, visual hierarchy yang disarankan:

```text
Pre-Order Information
        ↓
Ordering Flow
        ↓
Product Catalog
        ↓
CTA Pesan
        ↓
Footer / Additional Information
```

Elemen dekoratif tidak boleh lebih dominan daripada konten atau CTA utama.

---

# Final Visual Direction

Bukan:

```text
Red + White
```

Tetapi:

```text
Warm Cream
+ Ivory
+ Cocoa Brown
+ Mol-Mol Red
+ Caramel
+ Muted Sage
```

Feel yang ingin dipertahankan:

**warm, homemade, friendly, clean, premium snack, dan approachable.**

Perubahan sebaiknya tetap terasa seperti website Mol-Mol yang sekarang, hanya dibuat lebih rapi, konsisten, dan nyaman digunakan.
