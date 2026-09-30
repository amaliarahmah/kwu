# Logbook KWU

Aplikasi web untuk dokumentasi dan pembelajaran kegiatan kewirausahaan mahasiswa.

## Fitur

**Mahasiswa**
- **Beranda** — kelengkapan log, status per minggu, catatan dosen terbaru.
- **Log pribadi** — isi, ubah, dan hapus log kegiatan individu (tanggal, kegiatan, uraian, hasil, durasi).
- **Log kelompok** — log bersama kelompok usaha; semua anggota bisa melihat, hanya penulis yang bisa mengubah.
- **Dokumen** — unggah dokumen pribadi/kelompok (proposal, BMC, laporan, bukti kegiatan, dll.; maks. 10 MB).
- **Topik & materi** — materi pembelajaran per minggu, tandai materi yang sudah dipelajari.
- **Rekapitulasi** — ringkasan jumlah log, jam kegiatan, kelengkapan per minggu; bisa dicetak/PDF dan diunduh CSV.

**Dosen**
- **Dashboard kelengkapan** — persentase kelengkapan log individu dan kelompok, log terakhir, jumlah dokumen,
  progres materi; filter kelompok bimbingan; ekspor CSV.
- **Pemeriksaan** — setujui log atau minta revisi dengan catatan. Log yang disetujui terkunci bagi mahasiswa.
- **Materi pembelajaran** — kelola topik (per minggu) dan materi (teks, tautan, lampiran file).
- **Kelola data** — kelompok usaha & dosen pembimbing, akun mahasiswa (satuan atau impor massal dari Excel),
  reset kata sandi, pengaturan periode dan target log per minggu.

### Cara menghitung kelengkapan
Periode kegiatan dibagi per minggu mulai **tanggal mulai** yang diatur dosen. Sebuah minggu *terpenuhi* bila jumlah
log pada minggu itu ≥ target minimal. Persentase = minggu terpenuhi ÷ minggu yang **sudah selesai** (minggu berjalan
belum dinilai agar mahasiswa tidak dianggap tertinggal di tengah minggu). Kategori: Lengkap ≥ 80%, Kurang 50–79%,
Tertinggal < 50%. Semua log yang diisi dihitung, termasuk yang masih menunggu atau perlu revisi.

## Teknologi
Node.js ≥ 22.13, Express 5, EJS, SQLite bawaan Node (`node:sqlite`), multer, bcryptjs. Tidak perlu server database
terpisah; data dan file unggahan tersimpan di folder `data/`.

## Menjalankan

```bash
npm install
export SESSION_SECRET="$(openssl rand -hex 32)"

# Opsi A — data contoh untuk mencoba (semua akun: password123)
npm run seed
# Opsi B — mulai kosong: buat akun dosen pertama (kata sandi sementara dicetak di terminal)
npm run create-dosen -- 0012345601 "Nama Dosen, M.M."

npm start            # http://localhost:3000
```

Akun data contoh: dosen `0012345601`, `0012345602`; mahasiswa `2301001`–`2301005`.

Alur awal dosen: **Kelola Data** → atur periode → buat kelompok → impor mahasiswa (kata sandi sementara ditampilkan
sekali, mahasiswa wajib menggantinya saat login pertama) → isi **Materi**.

### Variabel lingkungan

| Variabel | Keterangan |
|---|---|
| `SESSION_SECRET` | **Wajib.** String acak panjang untuk menandatangani cookie sesi. |
| `PORT` | Port HTTP (bawaan 3000). |
| `DATA_DIR` | Lokasi database & unggahan (bawaan `./data`). |
| `COOKIE_SECURE=1` | Aktifkan bila diakses lewat HTTPS. |
| `TRUST_PROXY=1` | Aktifkan bila berada di belakang reverse proxy (Nginx, dll.). |

## Pengujian
```bash
npm test
```

## Catatan produksi
- Jalankan di belakang HTTPS (mis. Nginx) dengan `COOKIE_SECURE=1` dan `TRUST_PROXY=1`.
- Cadangkan folder `data/` secara berkala (berisi database dan semua file unggahan).
- `node:sqlite` masih berlabel *experimental* di Node 22; API-nya stabil dipakai di sini, tetapi uji ulang saat
  meningkatkan versi Node.
- SQLite cocok untuk skala satu kelas/fakultas (ratusan pengguna). Untuk skala universitas, pertimbangkan PostgreSQL.
