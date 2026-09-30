# Panduan Setup & Deployment Produksi di Alpine Linux

Dokumentasi resmi instalasi, konfigurasi, dan deployment production untuk aplikasi **Mol-Mol Purwokerto** ([@molmol.purwokerto](https://www.instagram.com/molmol.purwokerto/)) pada sistem operasi **Alpine Linux** (VPS, Server Bare-Metal, atau VM).

---

## Daftar Isi
1. [Persiapan Sistem Alpine Linux](#1-persiapan-sistem-alpine-linux)
2. [Instalasi Node.js, pnpm, & Dependensi](#2-instalasi-nodejs-pnpm--dependensi)
3. [Instalasi & Konfigurasi Database (MariaDB / MySQL)](#3-instalasi--konfigurasi-database-mariadb--mysql)
4. [Kloning Repositori & Konfigurasi Environment](#4-kloning-repositori--konfigurasi-environment)
5. [Migrasi Database & Build Produksi](#5-migrasi-database--build-produksi)
6. [Service Daemon Otomatis (OpenRC / PM2)](#6-service-daemon-otomatis-openrc--pm2)
7. [Setup Akses Domain via Cloudflare Tunnel (cloudflared)](#7-setup-akses-domain-via-cloudflare-tunnel-cloudflared--paling-mudah--aman)
8. [Alternatif Tradisional: Nginx Reverse Proxy & SSL Certbot](#8-alternatif-tradisional-nginx-reverse-proxy--ssl-certbot)
9. [Opsi Alternatif: Deployment via Docker](#9-opsi-alternatif-deployment-via-docker)
10. [Operasional & Perawatan Rutin](#10-operasional--perawatan-rutin)

---

## 1. Persiapan Sistem Alpine Linux

Perbarui indeks paket repository Alpine Linux ke versi terbaru:
```bash
apk update && apk upgrade
```

Pasang perkakas dasar yang dibutuhkan:
```bash
apk add curl wget git bash nano htop ca-certificates tzdata
```

Atur zona waktu server ke **WIB (Asia/Jakarta)**:
```bash
cp /usr/share/zoneinfo/Asia/Jakarta /etc/localtime
echo "Asia/Jakarta" > /etc/timezone
date
```

Buat akun pengguna non-root khusus untuk menjalankan aplikasi:
```bash
adduser -D -s /bin/bash -u 1001 molmol
```

---

## 2. Instalasi Node.js, pnpm, & Dependensi

Alpine Linux menggunakan *musl libc*, pasang Node.js versi LTS:
```bash
apk add nodejs npm
node -v # Pastikan versi Node.js >= 20.x

# Pasang package manager pnpm secara global
npm install -g pnpm
pnpm -v
```

---

## 3. Instalasi & Konfigurasi Database (MariaDB / MySQL)

Jika database dijalankan pada server yang sama:

```bash
# Pasang MariaDB server dan client
apk add mariadb mariadb-client

# Inisialisasi struktur database awal MariaDB
/etc/init.d/mariadb setup

# Jalankan service MariaDB dan aktifkan otomatis saat boot
rc-service mariadb start
rc-update add mariadb default

# Amankan instalasi database
mariadb-secure-installation
```

Masuk ke console MariaDB:
```bash
mariadb -u root -p
```

Jalankan perintah SQL untuk membuat database dan user:
```sql
CREATE DATABASE molmol_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'molmol_user'@'localhost' IDENTIFIED BY 'GantiDenganPasswordDatabaseAman2026!';
GRANT ALL PRIVILEGES ON molmol_db.* TO 'molmol_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

---

## 4. Kloning Repositori & Konfigurasi Environment

### A. Kloning Kode Sumber
```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/aulky/solid-molmolpwt.git molmol
chown -R molmol:molmol /var/www/molmol
cd /var/www/molmol
```

### B. Konfigurasi File Lingkungan (`.env`)
Salin file template `.env`:
```bash
cp .env.example .env
nano .env
```

Sesuaikan nilai variabel lingkungan untuk produksi:
```env
PORT=3001
BASE_URL="https://domain-anda.com"

# Database MySQL/MariaDB
DATABASE_URL="mysql://molmol_user:GantiDenganPasswordDatabaseAman2026!@127.0.0.1:3306/molmol_db"
DB_HOST="127.0.0.1"
DB_PORT=3306
DB_USER="molmol_user"
DB_PASSWORD="GantiDenganPasswordDatabaseAman2026!"
DB_NAME="molmol_db"

# Kredensial Default Admin Dapur
DEFAULT_ADMIN_USERNAME="admin"
DEFAULT_ADMIN_PASSWORD="GantiPasswordAdminAman2026!"
DEFAULT_ADMIN_NAME="Owner Mol-Mol"

# Session Secret (Kunci acak minimal 32 karakter)
ADMIN_SESSION_SECRET="kunci-rahasia-sesi-acak-panjang-dan-unik-molmol-purwokerto-2026"

# Bot Telegram Produksi (Opsional saat offline, wajib untuk notifikasi pesanan)
TELEGRAM_BOT_TOKEN="token_bot_telegram_anda"
TELEGRAM_ADMIN_CHAT_ID="id_chat_admin_toko"
TELEGRAM_SECRET_TOKEN="token_rahasia_webhook_telegram"
```

---

## 5. Migrasi Database & Build Produksi

Masuk sebagai user `molmol`:
```bash
su - molmol
cd /var/www/molmol

# Pasang seluruh dependensi proyek
pnpm install --frozen-lockfile

# Inisialisasi skema tabel & data awal (kompatibel penuh MariaDB & MySQL)
pnpm db:init

# Atur password admin yang diinginkan
pnpm db:set-password GantiPasswordAdminAman2026!

# Kompilasi aplikasi untuk produksi (Nitro Node Server)
pnpm build

# Pastikan folder uploads memiliki izin simpan file
chmod -R 775 /var/www/molmol/public/uploads

exit
```

---

## 6. Service Daemon Otomatis (OpenRC / PM2)

Pilih salah satu metode daemon di bawah ini:

### Opsi A: Menggunakan Service Bawaan Alpine Linux (OpenRC) — *Direkomendasikan (Paling Ringan & Tanpa PM2)*

Jika Anda login sebagai `root` (atau tanpa user khusus):
Buat file service:
```bash
nano /etc/init.d/molmol
```

Tempelkan skrip service berikut:
```bash
#!/sbin/openrc-run

name="molmol"
description="Mol-Mol Purwokerto Pre-Order Web Application"
command="/usr/bin/node"
command_args="/var/www/molmol/.output/server/index.mjs"
directory="/var/www/molmol"
command_background="true"
pidfile="/run/${RC_SVCNAME}.pid"

export NODE_ENV="production"
export PORT="3001"

depend() {
    need net
    after mariadb
}
```

Beri izin eksekusi, daftarkan saat boot, dan jalankan:
```bash
chmod +x /etc/init.d/molmol
rc-update add molmol default
rc-service molmol start

# Periksa status service
rc-service molmol status
```

---

### Opsi B: Menggunakan Process Manager PM2 (Sebagai User Root)

Alpine Linux menggunakan sistem init **`openrc`**. Jika Anda langsung login sebagai `root` (tanpa membuat user baru):

```bash
cd /var/www/molmol

# 1. Jalankan aplikasi dengan PM2
pm2 start .output/server/index.mjs --name "molmol-app" --node-args="--max-old-space-size=512"

# 2. Simpan daftar proses aktif
pm2 save

# 3. Aktifkan auto-start saat reboot (gunakan openrc)
pm2 startup
```

> **Catatan**: Jika PM2 menampilkan instruksi perintah setelah `pm2 startup`, salin dan jalankan perintah tersebut (biasanya `rc-update add pm2-root default`).

---

## 7. Setup Akses Domain via Cloudflare Tunnel (cloudflared) — *Paling Mudah & Aman*

Menggunakan **Cloudflare Tunnel (`cloudflared`)** adalah cara paling modern dan aman untuk menghubungkan server Alpine Linux Anda ke domain internet:
- **Tanpa Buka Port**: Port `80` dan `443` di firewall / router tidak perlu dibuka sama sekali.
- **SSL / HTTPS Otomatis**: Sertifikat SSL dikelola penuh oleh Cloudflare secara gratis.
- **Perlindungan DDoS & CDN Caching**: Lalu lintas website terlindungi oleh jaringan global Cloudflare.
- **Dukungan IP Dinamis / CGNAT**: Tetap bekerja meskipun server Anda tidak memiliki IP publik statis.

### Langkah 1: Pasang `cloudflared` di Alpine Linux

Jalankan perintah ini sebagai `root`:
```bash
# Unduh binary resmi cloudflared untuk Linux AMD64
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared

# Berikan izin eksekusi
chmod +x /usr/local/bin/cloudflared

# Verifikasi instalasi
cloudflared --version
```
*(Jika server Anda menggunakan arsitektur ARM64 / Raspberry Pi, ganti URL di atas dengan `cloudflared-linux-arm64`)*.

---

### Langkah 2: Buat Tunnel di Cloudflare Dashboard (Cara Termudah)

1. Buka dashboard Cloudflare: [dash.cloudflare.com](https://dash.cloudflare.com)
2. Masuk ke menu **Zero Trust** (di bilah menu kiri).
3. Pilih **Networks** ➔ **Tunnels** ➔ Klik tombol **Add a tunnel**.
4. Pilih opsi **Cloudflared** lalu klik **Next**.
5. Beri nama tunnel Anda, misalnya: `molmol-production` ➔ Klik **Save tunnel**.
6. Pada bagian **Choose your environment**, pilih **Linux** ➔ **64-bit**.
7. Anda akan melihat kotak perintah seperti ini:
   ```bash
   cloudflared service install eyJhIjoi...TOKEN_PANJANG_ANDA...
   ```
8. Salin dan jalankan perintah tersebut langsung di terminal Alpine Linux Anda!

> **PENTING UNTUK ALPINE LINUX (OpenRC)**:  
> Jika `cloudflared service install` memunculkan pesan tentang systemd, cukup buatkan service OpenRC dengan perintah berikut:
>
> ```bash
> # Buat file service OpenRC untuk cloudflared
> cat << 'EOF' > /etc/init.d/cloudflared
> #!/sbin/openrc-run
> name="cloudflared"
> description="Cloudflare Tunnel Daemon"
> command="/usr/local/bin/cloudflared"
> command_args="tunnel run --token TOKEN_PANJANG_ANDA"
> command_background="true"
> pidfile="/run/${RC_SVCNAME}.pid"
>
> depend() {
>     need net
> }
> EOF
>
> # Ganti TOKEN_PANJANG_ANDA di atas dengan token dari dashboard Cloudflare!
> chmod +x /etc/init.d/cloudflared
> rc-update add cloudflared default
> rc-service cloudflared start
> ```

---

### Langkah 3: Arahkan Domain ke Aplikasi Mol-Mol

Kembali ke halaman dashboard Cloudflare Zero Trust:
1. Klik **Next** menuju tab **Public Hostnames**.
2. Masukkan rincian domain:
   - **Subdomain**: (kosongkan jika domain utama, atau isi misal `app` / `order`)
   - **Domain**: Pilih domain Anda (contoh: `molmol.id` atau `domainanda.com`)
   - **Type**: Pilih **`HTTP`**
   - **URL**: Ketik **`localhost:3001`**
3. (Opsional tapi disarankan) Klik **Additional application settings**:
   - Di tab **HTTP Settings**, aktifkan **No TLS Verify** (jika pakai HTTPS internal).
   - Pastikan **Maximum Request Body Size** diset ke **100MB** agar upload foto menu & bukti transfer lancar.
4. Klik **Save tunnel**.

**Selesai!** Website Anda sekarang langsung bisa diakses melalui `https://domainanda.com` dengan SSL HTTPS hijau aktif secara instan!

---

## 8. Alternatif Tradisional: Nginx Reverse Proxy & SSL Certbot

Gunakan opsi ini jika Anda **tidak** menggunakan Cloudflare Tunnel dan ingin membuka port 80/443 secara manual di server VPS:

### A. Pasang Nginx & Certbot
```bash
apk add nginx certbot certbot-nginx
rc-update add nginx default
```

### B. Konfigurasi Virtual Host Nginx
Buat file konfigurasi vhost:
```bash
nano /etc/nginx/http.d/molmol.conf
```

Tempelkan konfigurasi berikut (sesuaikan nama domain):
```nginx
server {
    listen 80;
    listen [::]:80;
    server_name domain-anda.com www.domain-anda.com;

    # Batas ukuran upload foto menu & bukti transfer
    client_max_body_size 12M;

    # Static assets cache
    location ~* \.(ico|css|js|gif|jpeg|jpg|png|webp|svg|woff|woff2|ttf|eot)$ {
        root /var/www/molmol/.output/public;
        expires 30d;
        add_header Cache-Control "public, no-transform";
        try_files $uri @proxy;
    }

    # Uploaded media files
    location /uploads/ {
        alias /var/www/molmol/public/uploads/;
        expires 7d;
        add_header Cache-Control "public";
    }

    location / {
        try_files $uri @proxy;
    }

    location @proxy {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Uji sintaks dan restart service Nginx:
```bash
nginx -t
rc-service nginx restart
```

### C. Pasang Sertifikat SSL Gratis (Let's Encrypt)
```bash
certbot --nginx -d domain-anda.com -d www.domain-anda.com
```

Tambah cronjob otomatis untuk perpanjangan SSL:
```bash
echo "0 3 * * * certbot renew --quiet && rc-service nginx reload" >> /etc/crontabs/root
rc-service crond start
rc-update add crond default
```

---

## 9. Opsi Alternatif: Deployment via Docker

Jika ingin mendeploy via Docker container di Alpine Linux:

### A. Buat `Dockerfile`
```dockerfile
# Stage 1: Build
FROM node:24-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Stage 2: Production Runner
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY --from=builder /app/.output ./.output
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public

EXPOSE 3001
CMD ["node", ".output/server/index.mjs"]
```

### B. Buat `docker-compose.yml`
```yaml
version: '3.8'

services:
  db:
    image: mariadb:11-alpine
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: RootPasswordKuat2026!
      MYSQL_DATABASE: molmol_db
      MYSQL_USER: molmol_user
      MYSQL_PASSWORD: GantiDenganPasswordDatabaseAman2026!
    volumes:
      - mariadb_data:/var/lib/mysql

  app:
    build: .
    restart: always
    ports:
      - "3001:3001"
    environment:
      PORT: 3001
      DATABASE_URL: "mysql://molmol_user:GantiDenganPasswordDatabaseAman2026!@db:3306/molmol_db"
    volumes:
      - ./public/uploads:/app/public/uploads
    depends_on:
      - db

volumes:
  mariadb_data:
```

Jalankan container:
```bash
docker compose up -d
```

---

## 10. Operasional & Perawatan Rutin

| Kebutuhan | Perintah |
|---|---|
| Cek status server aplikasi | `rc-service molmol status` atau `pm2 status` |
| Restart server setelah pembaruan kode | `rc-service molmol restart` atau `pm2 restart molmol-app` |
| Cek log aktivitas server | `pm2 logs` atau `tail -f /var/log/messages` |
| Cek status tunnel Cloudflare | `rc-service cloudflared status` |
| Reset database total menyisakan akun admin | `cd /var/www/molmol && pnpm db:reset:admin-only` |
| Bersihkan data transaksi / order saja | `cd /var/www/molmol && pnpm db:clear:orders` |
| Ganti password akun admin | `cd /var/www/molmol && pnpm db:set-password <password_baru>` |
| Update kode dari repository GitHub | `git pull && pnpm install && pnpm build && pm2 restart molmol-app` |
