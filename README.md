# Logbook KWU

Aplikasi web untuk dokumentasi dan pembelajaran kegiatan kewirausahaan mahasiswa.

- **Tampilan** di-hosting gratis di **GitHub Pages** (folder `web/`, tanpa server).
- **Login & database** memakai **Supabase** (paket gratis).
- **Dokumen dikirim sebagai tautan** (Google Drive, OneDrive, dll.), jadi tidak butuh ruang penyimpanan file.

## Fitur

**Mahasiswa:** beranda (kelengkapan & catatan dosen) · log pribadi · log kelompok · dokumen (tautan) ·
topik & materi (tandai selesai) · rekapitulasi (cetak/PDF & CSV).

**Dosen:** dashboard kelengkapan log individu & kelompok (filter bimbingan, CSV) · pemeriksaan log
(setujui / minta revisi) · input topik & materi · kelola peserta (impor dari Excel, kode aktivasi),
kelompok, pembimbing, reset kata sandi, pengaturan periode.

**Cara menghitung kelengkapan:** periode dibagi per minggu sejak tanggal mulai. Minggu *terpenuhi* bila
jumlah log ≥ target minimal. Persentase = minggu terpenuhi ÷ minggu yang **sudah selesai** (minggu
berjalan belum dinilai). Lengkap ≥ 80%, Kurang 50–79%, Tertinggal < 50%.

**Cara akun dibuat:** dosen mendaftarkan peserta (NIM, nama, kelompok) → setiap peserta mendapat
**kode aktivasi** → peserta membuka aplikasi, pilih *Aktifkan akun*, isi NIM + kode + kata sandi sendiri.
Kode hanya bisa dipakai sekali.

---

## Pemasangan (sekali saja, ±20 menit)

### 1. Buat proyek Supabase
1. Daftar/masuk di <https://supabase.com> → **New project**. Pilih region terdekat (mis. Singapore),
   buat *database password* (simpan baik-baik).
2. Tunggu sampai proyek siap.

### 2. Pasang database
1. Di Supabase buka **SQL Editor** → **New query**.
2. Salin **seluruh isi** file [`supabase/schema.sql`](supabase/schema.sql), tempel, lalu klik **Run**.
   Harus muncul "Success".

### 3. Matikan konfirmasi email
Akun memakai NIM (bukan email sungguhan), jadi konfirmasi email harus dimatikan:
**Authentication → Sign In / Providers → Email → matikan "Confirm email" → Save.**
(Nama menu di Supabase kadang berubah; cari pengaturan "Confirm email".)

### 4. Daftarkan dosen pertama
Di **SQL Editor**, jalankan (ganti NIDN, nama, dan kode sesuai keinginan; kode 8 huruf/angka):

```sql
insert into public.roster (nim, name, role, activation_code)
values ('0012345601', 'Nama Dosen, M.M.', 'dosen', 'KODE1234');
```

Dosen berikutnya bisa ditambahkan dari aplikasi (**Kelola Data → Tambah satu peserta → Peran: Dosen**).

### 5. Hubungkan aplikasi ke Supabase
1. Di Supabase buka **Project Settings → API** (atau **Data API / API Keys**). Salin:
   - **Project URL** (mis. `https://abcdefgh.supabase.co`)
   - **anon public key** (atau **publishable key**)
2. Di GitHub buka file [`web/config.js`](web/config.js) → ikon pensil (Edit) → isi kedua nilai → **Commit changes** ke `main`.

Kedua nilai itu memang boleh publik. Yang **tidak boleh** dibagikan adalah *service_role key* dan
*database password*.

### 6. Aktifkan GitHub Pages
1. Di GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Buka tab **Actions**; tunggu workflow "Uji & terbitkan ke GitHub Pages" selesai (hijau).
   Jika belum berjalan, klik workflow itu → **Run workflow**.
3. Aplikasi tersedia di `https://<username>.github.io/<nama-repo>/`
   (untuk repo ini: `https://amaliarahmah.github.io/kwu/`).

### 7. Mulai pakai
1. Buka alamat aplikasi → **Aktifkan akun** → isi NIDN + kode dari langkah 4 + kata sandi baru.
2. **Kelola Data** → atur periode → impor mahasiswa (tempel dari Excel: `NIM;Nama;Kelompok;Prodi`).
3. Cetak/bagikan daftar **kode aktivasi** kepada mahasiswa.
4. **Materi** → tambah topik dan materi.

---

## Hal yang perlu diketahui

- **Proyek Supabase gratis dijeda bila tidak dipakai sekitar seminggu.** Data tidak hilang, tetapi
  aplikasi tidak bisa dibuka sampai proyek diaktifkan lagi dari dashboard Supabase (*Restore project*).
  Ketentuan paket gratis bisa berubah — periksa halaman harga Supabase.
- **Cadangan data:** paket gratis tidak menjamin backup yang bisa dipulihkan sendiri. Unduh CSV dari
  dashboard dosen secara berkala, terutama di akhir periode.
- **Lupa kata sandi:** tidak ada reset lewat email. Dosen membuka nama mahasiswa → **Reset kata sandi**
  → memberikan kata sandi sementara; mahasiswa wajib menggantinya saat masuk.
- **Dokumen berupa tautan:** mahasiswa harus mengatur akses "Siapa saja yang memiliki link dapat
  melihat". File di Drive masih bisa diubah/dihapus pemiliknya setelah dikirim.
- **Keamanan:** semua aturan akses (mahasiswa hanya melihat datanya sendiri & kelompoknya, tidak bisa
  menyetujui log sendiri, log yang disetujui terkunci) dijalankan oleh database (Row Level Security),
  bukan oleh tampilan. Jangan menonaktifkan RLS di Supabase.
- **`emailDomain` di `web/config.js`** jangan diubah setelah ada akun terdaftar — akun lama tidak bisa masuk.

---

## Untuk pengembang

```
web/                  aplikasi statis (HTML + JavaScript modul, tanpa build)
  js/app.js           router & penanganan aksi
  js/pages/           halaman mahasiswa & dosen
  js/lib/             logika murni (kelengkapan, format, validasi, escaping HTML)
  vendor/supabase.js  @supabase/supabase-js 2.117.2 (UMD)
supabase/schema.sql   tabel, fungsi, trigger, dan aturan RLS
tests/unit/           uji unit (node --test)
tests/e2e/            uji ujung-ke-ujung: browser + upaya penyalahgunaan API
tests/local-supabase/ tiruan Supabase lokal (Postgres + Supabase Auth + PostgREST)
```

```bash
npm test                 # uji unit
npm install              # dependensi uji e2e (Playwright, supabase-js)
npm run local            # jalankan Supabase lokal + aplikasi di http://localhost:8080 (butuh PostgreSQL 16)
npm run test:e2e         # uji e2e terhadap Supabase lokal (STACK_DIR sama dengan saat `npm run local`)
```
