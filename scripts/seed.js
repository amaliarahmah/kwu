// Mengisi database dengan data contoh untuk demo/uji coba lokal.
// JANGAN dijalankan di server produksi: semua akun contoh memakai kata sandi "password123".
const path = require('node:path');
const { openDb, saveSettings, transaction } = require('../src/db');
const { hashPassword } = require('../src/lib/accounts');

const dataDir = process.env.DATA_DIR ?? path.join(__dirname, '..', 'data');
const db = openDb(path.join(dataDir, 'kwu.sqlite'));

if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) {
  console.error('Database sudah berisi data. Hapus folder data/ bila ingin mengulang seed.');
  process.exit(1);
}

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const start = Date.now() - 5 * 7 * DAY; // periode dimulai 5 minggu lalu
const hash = hashPassword('password123');

transaction(db, () => {
  saveSettings(db, { period_start: iso(start), period_weeks: 14, program_name: 'Program Kewirausahaan Mahasiswa 2026' });

  const addUser = db.prepare('INSERT INTO users (username, name, password_hash, role, prodi, group_id) VALUES (?, ?, ?, ?, ?, ?)');
  const dosen1 = Number(addUser.run('0012345601', 'Dr. Sri Wahyuni, M.M.', hash, 'dosen', null, null).lastInsertRowid);
  const dosen2 = Number(addUser.run('0012345602', 'Andi Pratama, S.E., M.B.A.', hash, 'dosen', null, null).lastInsertRowid);

  const addGroup = db.prepare('INSERT INTO groups (name, business_name, business_desc, mentor_id) VALUES (?, ?, ?, ?)');
  const g1 = Number(addGroup.run('K-01', 'Keripik Singkong "Renyah"', 'Produksi keripik singkong aneka rasa untuk pasar mahasiswa.', dosen1).lastInsertRowid);
  const g2 = Number(addGroup.run('K-02', 'Jasa Desain "Karsa"', 'Jasa desain logo dan kemasan untuk UMKM.', dosen2).lastInsertRowid);

  const students = [
    ['2301001', 'Ani Lestari', 'Manajemen', g1],
    ['2301002', 'Budi Santoso', 'Akuntansi', g1],
    ['2301003', 'Citra Dewi', 'Manajemen', g1],
    ['2301004', 'Dimas Saputra', 'Informatika', g2],
    ['2301005', 'Eka Putri', 'DKV', g2],
  ].map(([nim, name, prodi, group]) => ({ id: Number(addUser.run(nim, name, hash, 'mahasiswa', prodi, group).lastInsertRowid), group }));

  const activities = [
    ['Survei harga bahan baku', 'Mengunjungi pasar untuk membandingkan harga singkong dan bumbu.', 'Harga termurah Rp6.000/kg di pasar induk.'],
    ['Wawancara calon pelanggan', 'Wawancara 10 mahasiswa tentang preferensi camilan.', 'Rasa balado dan keju paling diminati.'],
    ['Menyusun Business Model Canvas', 'Mengisi 9 blok BMC bersama kelompok.', 'Segmen utama: mahasiswa & kantin kampus.'],
    ['Uji coba produksi', 'Produksi percobaan 2 kg keripik.', 'Tingkat kerenyahan belum konsisten; perlu atur suhu minyak.'],
    ['Menghitung HPP', 'Menghitung biaya bahan, kemasan, dan tenaga kerja.', 'HPP Rp4.200 per bungkus 100 g.'],
  ];
  const addPersonal = db.prepare(
    'INSERT INTO personal_logs (user_id, log_date, activity, description, outcome, duration_hours, status, feedback) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  students.forEach((s, si) => {
    for (let week = 0; week < 5; week += 1) {
      if ((si === 3 && week % 2 === 1) || (si === 4 && week > 1)) continue; // variasi kelengkapan
      const [activity, description, outcome] = activities[(week + si) % activities.length];
      const status = week < 2 ? 'disetujui' : week === 2 && si === 0 ? 'revisi' : 'menunggu';
      const feedback = status === 'revisi' ? 'Lengkapi dengan data jumlah responden dan foto kegiatan.' : null;
      addPersonal.run(s.id, iso(start + week * 7 * DAY + (si % 3) * DAY), activity, description, outcome, 2 + (si % 3), status, feedback);
    }
  });

  const addGroupLog = db.prepare(
    'INSERT INTO group_logs (group_id, author_id, log_date, activity, description, outcome, attendees, duration_hours, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (let week = 0; week < 5; week += 1) {
    addGroupLog.run(g1, students[week % 3].id, iso(start + week * 7 * DAY + 2 * DAY), `Rapat mingguan ${week + 1}`,
      'Evaluasi progres dan pembagian tugas minggu berikutnya.', 'Target penjualan 50 bungkus.', 'Ani, Budi, Citra', 1.5,
      week < 3 ? 'disetujui' : 'menunggu');
    if (week < 3) {
      addGroupLog.run(g2, students[3].id, iso(start + week * 7 * DAY + 3 * DAY), `Diskusi klien ${week + 1}`,
        'Membahas kebutuhan desain klien UMKM.', 'Draf logo disetujui klien.', 'Dimas, Eka', 2, 'menunggu');
    }
  }

  const addTopic = db.prepare('INSERT INTO topics (title, description, week_no, created_by) VALUES (?, ?, ?, ?)');
  const addMaterial = db.prepare('INSERT INTO materials (topic_id, title, content, link_url, created_by) VALUES (?, ?, ?, ?, ?)');
  const t1 = Number(addTopic.run('Pola Pikir Wirausaha', 'Memahami karakter dan pola pikir wirausaha.', 1, dosen1).lastInsertRowid);
  const t2 = Number(addTopic.run('Validasi Ide Bisnis', 'Menguji apakah masalah pelanggan benar-benar ada sebelum membangun produk.', 2, dosen1).lastInsertRowid);
  const t3 = Number(addTopic.run('Business Model Canvas', 'Memetakan model bisnis dalam 9 blok.', 3, dosen1).lastInsertRowid);
  const m1 = Number(addMaterial.run(t1, 'Karakter wirausaha', 'Wirausaha yang tangguh memiliki:\n1. Kemauan belajar dari kegagalan\n2. Berorientasi pada solusi pelanggan\n3. Disiplin mencatat dan mengevaluasi kegiatan\n\nTugas refleksi: tuliskan satu kegagalan dan pelajaran yang Anda ambil di log pribadi.', null, dosen1).lastInsertRowid);
  addMaterial.run(t2, 'Wawancara pelanggan', 'Gunakan pertanyaan terbuka tentang pengalaman masa lalu, bukan pendapat tentang ide Anda.\n\nContoh: "Kapan terakhir kali Anda membeli camilan di kampus? Apa yang Anda beli?"', null, dosen1);
  addMaterial.run(t3, 'Mengisi 9 blok BMC', 'Isi blok secara berurutan: segmen pelanggan, proposisi nilai, saluran, hubungan pelanggan, arus pendapatan, sumber daya utama, aktivitas utama, mitra utama, struktur biaya.', null, dosen1);
  db.prepare('INSERT INTO material_progress (user_id, material_id) VALUES (?, ?)').run(students[0].id, m1);
});

console.log('Data contoh dibuat. Semua akun memakai kata sandi: password123');
console.log('  Dosen    : 0012345601, 0012345602');
console.log('  Mahasiswa: 2301001 – 2301005');
