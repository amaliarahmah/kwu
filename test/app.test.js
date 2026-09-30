const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createApp } = require('../src/app');
const { openDb } = require('../src/db');
const { hashPassword } = require('../src/lib/accounts');

let server;
let baseUrl;
let db;
let dataDir;
let ids;

// Klien HTTP sederhana yang menyimpan cookie sesi dan token CSRF.
class Client {
  constructor() {
    this.cookie = '';
    this.csrf = '';
  }

  async request(method, url, { form, multipart, redirect = 'manual' } = {}) {
    const headers = {};
    if (this.cookie) headers.cookie = this.cookie;
    let body;
    if (form) {
      body = new URLSearchParams({ _csrf: this.csrf, ...form });
    } else if (multipart) {
      body = new FormData();
      body.append('_csrf', this.csrf);
      for (const [k, v] of Object.entries(multipart)) {
        if (v.blob) body.append(k, v.blob, v.name);
        else body.append(k, v);
      }
    }
    const res = await fetch(baseUrl + url, { method, headers, body, redirect });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];
    const text = res.headers.get('content-type')?.includes('text/html') ? await res.text() : null;
    const match = text?.match(/name="_csrf" value="([^"]+)"/);
    if (match) this.csrf = match[1];
    return { res, text };
  }

  get(url) {
    return this.request('GET', url);
  }

  post(url, form) {
    return this.request('POST', url, { form });
  }

  async login(username, password = 'password123') {
    await this.get('/login');
    const { res } = await this.post('/login', { username, password });
    assert.equal(res.status, 302, `login ${username}`);
    await this.get('/');
    return this;
  }
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kwu-test-'));
  db = openDb(path.join(dataDir, 'kwu.sqlite'));
  const hash = hashPassword('password123');
  const today = new Date();
  const start = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) - 21 * 86400000);
  db.prepare("UPDATE settings SET value = ? WHERE key = 'period_start'").run(start.toISOString().slice(0, 10));

  const addUser = db.prepare('INSERT INTO users (username, name, password_hash, role, group_id) VALUES (?, ?, ?, ?, ?)');
  const dosen = Number(addUser.run('D001', 'Dosen Satu', hash, 'dosen', null).lastInsertRowid);
  const group = Number(db.prepare('INSERT INTO groups (name, mentor_id) VALUES (?, ?)').run('K-01', dosen).lastInsertRowid);
  const ani = Number(addUser.run('M001', 'Ani', hash, 'mahasiswa', group).lastInsertRowid);
  const budi = Number(addUser.run('M002', 'Budi', hash, 'mahasiswa', group).lastInsertRowid);
  const citra = Number(addUser.run('M003', 'Citra', hash, 'mahasiswa', null).lastInsertRowid);
  ids = { dosen, group, ani, budi, citra };

  const app = createApp({ db, dataDir, sessionSecret: 'test-secret' });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('login gagal dengan kata sandi salah dan halaman terlindungi mengalihkan ke login', async () => {
  const c = new Client();
  await c.get('/login');
  const { res } = await c.post('/login', { username: 'M001', password: 'salah' });
  assert.equal(res.status, 401);
  const guarded = await new Client().get('/mahasiswa');
  assert.equal(guarded.res.status, 302);
  assert.equal(guarded.res.headers.get('location'), '/login');
});

test('POST tanpa token CSRF ditolak', async () => {
  const c = await new Client().login('M001');
  c.csrf = 'token-palsu';
  const { res } = await c.post('/mahasiswa/log-pribadi', { log_date: '2026-01-01', activity: 'x' });
  assert.equal(res.status, 403);
});

test('mahasiswa dapat membuka semua menu dan mengisi log pribadi', async () => {
  const c = await new Client().login('M001');
  for (const url of ['/mahasiswa', '/mahasiswa/log-pribadi', '/mahasiswa/log-kelompok', '/mahasiswa/dokumen',
    '/mahasiswa/materi', '/mahasiswa/rekap']) {
    const { res } = await c.get(url);
    assert.equal(res.status, 200, url);
  }

  const invalid = await c.post('/mahasiswa/log-pribadi', { log_date: '2026-02-31', activity: '' });
  assert.equal(invalid.res.status, 400);
  assert.match(invalid.text, /Tanggal kegiatan tidak valid/);

  const today = new Date().toISOString().slice(0, 10);
  const { res } = await c.post('/mahasiswa/log-pribadi', {
    log_date: today, activity: 'Survei pasar <script>', description: 'Baris 1\nBaris 2', duration_hours: '2,5',
  });
  assert.equal(res.status, 302);
  const row = db.prepare('SELECT * FROM personal_logs WHERE user_id = ?').get(ids.ani);
  assert.equal(row.duration_hours, 2.5);
  const page = await c.get('/mahasiswa/log-pribadi');
  assert.match(page.text, /Survei pasar &lt;script&gt;/);

  const csv = await c.get('/mahasiswa/rekap.csv');
  assert.equal(csv.res.status, 200);
  assert.match(await csv.res.text(), /Survei pasar/);
});

test('mahasiswa tidak dapat mengakses halaman dosen', async () => {
  const c = await new Client().login('M001');
  const { res } = await c.get('/dosen');
  assert.equal(res.status, 403);
});

test('log kelompok hanya dapat diubah penulisnya; mahasiswa tanpa kelompok ditolak', async () => {
  const ani = await new Client().login('M001');
  await ani.get('/mahasiswa/log-kelompok');
  await ani.post('/mahasiswa/log-kelompok', { log_date: new Date().toISOString().slice(0, 10), activity: 'Rapat kelompok' });
  const log = db.prepare('SELECT * FROM group_logs WHERE group_id = ?').get(ids.group);
  assert.equal(log.author_id, ids.ani);

  const budi = await new Client().login('M002');
  await budi.get('/mahasiswa/log-kelompok');
  await budi.post(`/mahasiswa/log-kelompok/${log.id}/hapus`, {});
  assert.ok(db.prepare('SELECT 1 FROM group_logs WHERE id = ?').get(log.id), 'log tidak boleh terhapus oleh anggota lain');

  const citra = await new Client().login('M003');
  await citra.get('/mahasiswa/log-kelompok');
  await citra.post('/mahasiswa/log-kelompok', { log_date: '2026-01-01', activity: 'x' });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM group_logs').get().n, 1);
});

test('unggah dokumen: hak akses unduhan pribadi vs kelompok', async () => {
  const ani = await new Client().login('M001');
  await ani.get('/mahasiswa/dokumen');
  const file = (name) => ({ blob: new Blob(['isi dokumen'], { type: 'application/pdf' }), name });

  const up1 = await ani.request('POST', '/mahasiswa/dokumen', {
    multipart: { title: 'Proposal', category: 'Proposal usaha', scope: 'pribadi', file: file('Proposal Usaha – Ani.pdf') },
  });
  assert.equal(up1.res.status, 302);
  const up2 = await ani.request('POST', '/mahasiswa/dokumen', {
    multipart: { title: 'Foto kegiatan', category: 'Bukti kegiatan (foto/nota)', scope: 'kelompok', file: file('foto.pdf') },
  });
  assert.equal(up2.res.status, 302);
  const bad = await ani.request('POST', '/mahasiswa/dokumen', {
    multipart: { title: 'Script', category: 'Lainnya', scope: 'pribadi', file: file('evil.html') },
  });
  assert.equal(bad.res.status, 400);
  assert.match(bad.text, /tidak diizinkan/);

  const priv = db.prepare("SELECT * FROM documents WHERE scope = 'pribadi'").get();
  const grp = db.prepare("SELECT * FROM documents WHERE scope = 'kelompok'").get();
  assert.equal(priv.original_name, 'Proposal Usaha – Ani.pdf');

  const own = await ani.get(`/unduh/dokumen/${priv.id}`);
  assert.equal(own.res.status, 200);
  assert.match(own.res.headers.get('content-disposition'), /attachment/);

  const budi = await new Client().login('M002');
  assert.equal((await budi.get(`/unduh/dokumen/${priv.id}`)).res.status, 404);
  assert.equal((await budi.get(`/unduh/dokumen/${grp.id}`)).res.status, 200);

  const citra = await new Client().login('M003');
  assert.equal((await citra.get(`/unduh/dokumen/${grp.id}`)).res.status, 404);

  const dosen = await new Client().login('D001');
  assert.equal((await dosen.get(`/unduh/dokumen/${priv.id}`)).res.status, 200);
});

test('dosen: dashboard, pemeriksaan log, dan materi', async () => {
  const dosen = await new Client().login('D001');
  for (const url of ['/dosen', '/dosen/antrian', '/dosen/materi', '/dosen/kelola', `/dosen/mahasiswa/${ids.ani}`,
    `/dosen/kelompok/${ids.group}`, '/dosen/dashboard.csv', '/dosen?lingkup=bimbingan']) {
    const { res } = await dosen.get(url);
    assert.equal(res.status, 200, url);
  }

  const log = db.prepare('SELECT id FROM personal_logs WHERE user_id = ?').get(ids.ani);
  await dosen.get('/dosen/antrian');
  const noNote = await dosen.post(`/dosen/log-pribadi/${log.id}/review`, { status: 'revisi', feedback: '', back: '/dosen/antrian' });
  assert.equal(noNote.res.status, 302);
  assert.equal(db.prepare('SELECT status FROM personal_logs WHERE id = ?').get(log.id).status, 'menunggu');
  await dosen.post(`/dosen/log-pribadi/${log.id}/review`, { status: 'disetujui', feedback: 'Bagus', back: 'https://evil.example' });
  assert.equal(db.prepare('SELECT status FROM personal_logs WHERE id = ?').get(log.id).status, 'disetujui');

  // Log yang sudah disetujui tidak bisa diubah mahasiswa.
  const ani = await new Client().login('M001');
  await ani.get('/mahasiswa/log-pribadi');
  await ani.post(`/mahasiswa/log-pribadi/${log.id}/hapus`, {});
  assert.ok(db.prepare('SELECT 1 FROM personal_logs WHERE id = ?').get(log.id));

  await dosen.get('/dosen/materi');
  await dosen.post('/dosen/topik', { title: 'Validasi Ide', week_no: '2', description: '' });
  const topic = db.prepare('SELECT id FROM topics').get();
  await dosen.get('/dosen/materi/baru');
  const created = await dosen.request('POST', '/dosen/materi', {
    multipart: {
      topic_id: String(topic.id), title: 'Wawancara pelanggan', content: 'Isi materi', link_url: 'javascript:alert(1)',
    },
  });
  assert.equal(created.res.status, 400, 'tautan non-http harus ditolak');
  const ok = await dosen.request('POST', '/dosen/materi', {
    multipart: {
      topic_id: String(topic.id), title: 'Wawancara pelanggan', content: 'Isi materi',
      file: { blob: new Blob(['slide']), name: 'slide.pptx' },
    },
  });
  assert.equal(ok.res.status, 302);
  const material = db.prepare('SELECT * FROM materials').get();

  await ani.get(`/mahasiswa/materi/${material.id}`);
  await ani.post(`/mahasiswa/materi/${material.id}/selesai`, { done: '1' });
  assert.ok(db.prepare('SELECT 1 FROM material_progress WHERE user_id = ? AND material_id = ?').get(ids.ani, material.id));
  assert.equal((await ani.get(`/unduh/materi/${material.id}`)).res.status, 200);
});

test('dosen mengimpor mahasiswa; akun baru wajib mengganti kata sandi', async () => {
  const dosen = await new Client().login('D001');
  await dosen.get('/dosen/kelola');
  const { res, text } = await dosen.post('/dosen/mahasiswa', { bulk: 'M010;Dewi Baru;K-02;Manajemen\nM001;Duplikat;;' });
  assert.equal(res.status, 200);
  const password = text.match(/<td>M010<\/td><td>Dewi Baru<\/td><td><code>([^<]+)<\/code>/)[1];
  assert.ok(db.prepare("SELECT 1 FROM groups WHERE name = 'K-02'").get(), 'kelompok baru dibuat otomatis');

  const dewi = new Client();
  await dewi.login('M010', password);
  const blocked = await dewi.get('/mahasiswa/log-pribadi');
  assert.equal(blocked.res.headers.get('location'), '/akun/password');
  await dewi.get('/akun/password');
  await dewi.post('/akun/password', { current: password, next: 'kataSandiBaru1', confirm: 'kataSandiBaru1' });
  assert.equal((await dewi.get('/mahasiswa/log-pribadi')).res.status, 200);
});

test('pengaturan periode memvalidasi input', async () => {
  const dosen = await new Client().login('D001');
  await dosen.get('/dosen/kelola');
  await dosen.post('/dosen/pengaturan', {
    program_name: 'KWU', period_start: '2026-13-01', period_weeks: '14',
    min_personal_logs_per_week: '1', min_group_logs_per_week: '1',
  });
  assert.notEqual(db.prepare("SELECT value FROM settings WHERE key = 'period_start'").get().value, '2026-13-01');
  await dosen.post('/dosen/pengaturan', {
    program_name: 'KWU', period_start: '2026-08-31', period_weeks: '16',
    min_personal_logs_per_week: '2', min_group_logs_per_week: '1',
  });
  assert.equal(db.prepare("SELECT value FROM settings WHERE key = 'period_weeks'").get().value, '16');
});
