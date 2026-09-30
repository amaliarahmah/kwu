// Uji ujung-ke-ujung terhadap Supabase lokal (jalankan dulu: npm run local).
// Menguji alur di browser sungguhan + upaya penyalahgunaan langsung lewat API (RLS).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { ANON_KEY } from '../local-supabase/keys.mjs';

const BASE = process.env.APP_URL ?? 'http://localhost:8080';
const STACK = process.env.STACK_DIR ?? '/opt/kwu-stack';
const PASSWORD = 'rahasia123';

function sql(query) {
  return execFileSync('psql', ['-h', `${STACK}/pgsock`, '-p', '5433', '-U', 'postgres', '-d', 'kwu', '-Atq', '-v', 'ON_ERROR_STOP=1', '-c', query])
    .toString()
    .trim();
}

const email = (nim) => `${nim.toLowerCase()}@logbook-kwu.local`;

async function apiAs(nim, password = PASSWORD) {
  const client = createClient(BASE, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: email(nim), password });
  assert.ifError(error);
  return { client, user: data.user };
}

let browser;
const pageErrors = [];

async function newPage() {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('dialog', (d) => d.accept());
  return page;
}

async function activate(page, nim, code, password = PASSWORD) {
  await page.goto(`${BASE}/#/aktivasi`);
  await page.fill('input[name=nim]', nim);
  await page.fill('input[name=code]', code);
  await page.fill('input[name=password]', password);
  await page.fill('input[name=confirm]', password);
  await page.click('form[data-action=activate] button[type=submit]');
}

async function login(page, nim, password = PASSWORD) {
  await page.goto(`${BASE}/#/login`);
  await page.fill('input[name=nim]', nim);
  await page.fill('input[name=password]', password);
  await page.click('form[data-action=login] button[type=submit]');
}

const mainText = (page) => page.textContent('main');
// Tunggu sampai halaman tujuan selesai dirender (judul h1 tampil).
const heading = (page, text) => page.waitForSelector(`main h1:has-text(${JSON.stringify(text)})`);

before(async () => {
  sql(`truncate public.roster, public.groups, public.topics cascade; delete from auth.users;`);
  const start = new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10);
  sql(`update public.settings set period_start = '${start}', period_weeks = 14`);
  sql(`insert into public.roster (nim, name, role, activation_code) values ('D001', 'Dosen Satu', 'dosen', 'DOSENKOD')`);
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  assert.deepEqual(pageErrors, [], 'tidak boleh ada error JavaScript di halaman');
});

test('pendaftaran ditolak tanpa kode aktivasi yang benar', async () => {
  const anon = createClient(BASE, ANON_KEY, { auth: { persistSession: false } });
  assert.equal((await anon.rpc('check_activation', { p_nim: 'D001', p_code: 'SALAH' })).data, null);
  const { error } = await anon.auth.signUp({ email: email('D001'), password: PASSWORD, options: { data: { nim: 'D001', activation_code: 'SALAH' } } });
  assert.ok(error, 'signUp harus gagal');
  const { error: noNim } = await anon.auth.signUp({ email: email('X999'), password: PASSWORD, options: { data: { nim: 'X999' } } });
  assert.ok(noNim, 'NIM yang tidak ada di roster harus ditolak');
  // Pengunjung anonim tidak bisa membaca data apa pun.
  const roster = await anon.from('roster').select('*');
  assert.ok(roster.error || roster.data.length === 0);
  const settings = await anon.from('settings').select('*');
  assert.ok(settings.error || settings.data.length === 0);
});

test('dosen mengaktifkan akun, mengatur kelompok, mengimpor mahasiswa, dan menambah materi', async () => {
  const page = await newPage();
  await activate(page, 'D001', 'dosenkod');
  await heading(page, 'Dashboard Kelengkapan Log');

  await page.goto(`${BASE}/#/dosen/kelola`);
  await heading(page, 'Kelola Data');
  await page.fill('form[data-action=import] textarea[name=bulk]',
    'M001;Ani Lestari;K-01;Manajemen\nM002;Budi Santoso;K-01;Akuntansi\nM003;Citra Dewi;K-02;\nbad nim!;X;;');
  await page.click('form[data-action=import] button[type=submit]');
  await page.waitForSelector('form[data-action=import] .form-errors .alert');
  assert.match(await page.textContent('form[data-action=import]'), /3 peserta ditambahkan.*NIM tidak valid/s);
  await page.reload();
  await page.waitForSelector('#kode table');
  assert.match(await page.textContent('#kode'), /M001.*Ani Lestari.*K-01/s);
  assert.equal(sql(`select count(*) from public.groups`), '2');

  // Jadikan dosen ini pembimbing K-01.
  await page.click('#kelompok tr:has-text("K-01") summary');
  await page.selectOption('#kelompok tr:has-text("K-01") select[name=mentor_id]', { label: 'Dosen Satu' });
  await page.click('#kelompok tr:has-text("K-01") form[data-action=update-group] button[type=submit]');
  await page.waitForSelector('.alert-success');

  await page.goto(`${BASE}/#/dosen/materi`);
  await heading(page, 'Materi Pembelajaran');
  await page.fill('form[data-action=add-topic] input[name=title]', 'Validasi Ide Bisnis');
  await page.fill('form[data-action=add-topic] input[name=week_no]', '2');
  await page.click('form[data-action=add-topic] button[type=submit]');
  await page.waitForSelector('.alert-success');
  await page.goto(`${BASE}/#/dosen/materi/baru`);
  await heading(page, 'Tambah Materi');
  await page.fill('input[name=title]', 'Wawancara pelanggan');
  await page.fill('textarea[name=content]', 'Gunakan pertanyaan terbuka.');
  await page.fill('input[name=link_url]', 'javascript:alert(1)');
  await page.click('form[data-action=save] button[type=submit]');
  await page.waitForSelector('.form-errors .alert');
  await page.fill('input[name=link_url]', 'https://www.youtube.com/watch?v=abc');
  await page.click('form[data-action=save] button[type=submit]');
  await page.waitForSelector('main td:has-text("Wawancara pelanggan")');
  await page.context().close();
});

test('mahasiswa mengaktifkan akun lalu mengisi log, log kelompok, dokumen, dan materi', async () => {
  const code = (nim) => sql(`select activation_code from public.roster where nim = '${nim}'`);
  const page = await newPage();
  await activate(page, 'M001', code('M001'));
  await heading(page, 'Halo, Ani');
  assert.equal(sql(`select activation_code is null from public.roster where nim = 'M001'`), 't');

  // Kode yang sudah dipakai tidak bisa dipakai lagi.
  const anon = createClient(BASE, ANON_KEY, { auth: { persistSession: false } });
  const reuse = await anon.auth.signUp({ email: 'lain@logbook-kwu.local', password: PASSWORD, options: { data: { nim: 'M001', activation_code: 'APAPUN' } } });
  assert.ok(reuse.error);

  await page.goto(`${BASE}/#/mahasiswa/log-pribadi`);
  await heading(page, 'Log Pribadi');
  await page.fill('input[name=activity]', '<img src=x onerror=alert(1)> Survei pasar');
  await page.fill('textarea[name=description]', 'Baris 1\nBaris 2');
  await page.fill('input[name=duration_hours]', '2.5');
  await page.click('form[data-action=save-log] button[type=submit]');
  await page.waitForSelector('.alert-success');
  assert.match(await mainText(page), /<img src=x onerror=alert\(1\)> Survei pasar/, 'isian harus tampil sebagai teks, bukan HTML');
  assert.equal(await page.locator('main img').count(), 0);

  await page.goto(`${BASE}/#/mahasiswa/log-kelompok`);
  await heading(page, 'Log Kelompok');
  await page.fill('input[name=activity]', 'Rapat kelompok');
  await page.click('form[data-action=save-log] button[type=submit]');
  await page.waitForSelector('.alert-success');

  await page.goto(`${BASE}/#/mahasiswa/dokumen`);
  await heading(page, 'Dokumen');
  await page.fill('input[name=title]', 'Proposal');
  await page.fill('input[name=url]', 'https://drive.google.com/file/d/abc/view');
  await page.selectOption('select[name=scope]', 'kelompok');
  await page.click('form[data-action=add-document] button[type=submit]');
  await page.waitForSelector('.alert-success');
  await page.fill('input[name=title]', 'Catatan pribadi');
  await page.fill('input[name=url]', 'https://drive.google.com/file/d/xyz/view');
  await page.click('form[data-action=add-document] button[type=submit]');
  await page.waitForSelector('main h2:has-text("2 dokumen")');

  await page.goto(`${BASE}/#/mahasiswa/materi`);
  await heading(page, 'Topik');
  await page.click('main a:has-text("Wawancara pelanggan")');
  await page.click('button[data-action=toggle]');
  await page.waitForSelector('text=Selesai dipelajari');

  await page.goto(`${BASE}/#/mahasiswa/rekap`);
  await heading(page, 'Rekapitulasi Log Kegiatan');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('button[data-action=csv]')]);
  assert.equal(download.suggestedFilename(), 'rekap-log-M001.csv');
  await page.context().close();

  const budi = await newPage();
  await activate(budi, 'M002', code('M002'));
  await heading(budi, 'Halo, Budi');
  await budi.goto(`${BASE}/#/mahasiswa/dokumen`);
  await heading(budi, 'Dokumen');
  await budi.waitForSelector('main table');
  const docs = await mainText(budi);
  assert.match(docs, /Proposal/, 'dokumen kelompok terlihat anggota lain');
  assert.doesNotMatch(docs, /Catatan pribadi/, 'dokumen pribadi Ani tidak terlihat oleh Budi');
  await budi.context().close();

  const citra = await newPage();
  await activate(citra, 'M003', code('M003'));
  await heading(citra, 'Halo, Citra');
  await citra.context().close();
});

test('RLS: mahasiswa tidak dapat menyalahgunakan API', async () => {
  const { client: ani, user } = await apiAs('M001');
  const budiId = sql(`select id from public.profiles where nim = 'M002'`);
  const citraGroup = sql(`select group_id from public.profiles where nim = 'M003'`);

  const inserted = await ani.from('personal_logs')
    .insert({ log_date: '2026-09-01', activity: 'Coba setujui sendiri', status: 'disetujui', feedback: 'palsu', user_id: budiId })
    .select().single();
  // user_id milik orang lain ditolak oleh RLS.
  assert.ok(inserted.error);
  const own = await ani.from('personal_logs').insert({ log_date: '2026-09-01', activity: 'Log sah', status: 'disetujui' }).select().single();
  assert.ifError(own.error);
  assert.equal(own.data.status, 'menunggu', 'status dipaksa "menunggu"');
  const upd = await ani.from('personal_logs').update({ status: 'disetujui' }).eq('id', own.data.id).select().single();
  assert.equal(upd.data.status, 'menunggu');

  assert.equal((await ani.from('personal_logs').select('*').eq('user_id', budiId)).data.length, 0);
  assert.equal((await ani.from('roster').select('*')).data.length, 0);
  assert.equal((await ani.from('profiles').update({ role: 'dosen' }).eq('id', user.id).select()).data.length, 0);
  assert.equal(sql(`select role from public.profiles where id = '${user.id}'`), 'mahasiswa');
  assert.ok((await ani.from('group_logs').insert({ group_id: Number(citraGroup), log_date: '2026-09-01', activity: 'x' })).error);
  assert.ok((await ani.from('documents').insert({ scope: 'kelompok', group_id: Number(citraGroup), category: 'Lainnya', title: 'x', url: 'https://a.b' })).error);
  assert.ok((await ani.from('documents').insert({ scope: 'pribadi', category: 'Lainnya', title: 'x', url: 'javascript:alert(1)' })).error);
  assert.ok((await ani.rpc('reset_student_password', { p_user: budiId })).error);
  assert.ok((await ani.rpc('delete_student', { p_user: budiId })).error);
  assert.ok((await ani.rpc('import_roster', { p_rows: [{ nim: 'HACK1', name: 'x' }] })).error);
  assert.ok((await ani.from('settings').update({ period_weeks: 1 }).eq('id', 1).select()).data.length === 0);
  assert.ok((await ani.from('topics').insert({ title: 'x' })).error);
  assert.equal(sql(`select period_weeks from public.settings`), '14');
});

test('dosen memeriksa log; log yang disetujui terkunci bagi mahasiswa', async () => {
  const page = await newPage();
  await login(page, 'D001');
  await heading(page, 'Dashboard Kelengkapan Log');
  assert.match(await mainText(page), /Ani Lestari/);

  await page.goto(`${BASE}/#/dosen/antrian`);
  await heading(page, 'Antrian Pemeriksaan Log');
  const card = page.locator('.log-item', { hasText: 'Survei pasar' });
  await card.locator('button[value=revisi]').click();
  await page.waitForSelector('.form-errors .alert');
  await card.locator('textarea[name=feedback]').fill('Bagus, lanjutkan');
  await card.locator('button[value=disetujui]').click();
  await page.waitForSelector('.alert-success');
  const logId = sql(`select id from public.personal_logs where activity like '%Survei pasar'`);
  assert.equal(sql(`select status from public.personal_logs where id = ${logId}`), 'disetujui');

  const { client: ani } = await apiAs('M001');
  const edit = await ani.from('personal_logs').update({ activity: 'ubah' }).eq('id', logId);
  assert.ok(edit.error, 'log disetujui tidak boleh diubah');
  const del = await ani.from('personal_logs').delete().eq('id', logId).select();
  assert.equal(del.data.length, 0, 'log disetujui tidak boleh dihapus');
  await page.context().close();
});

test('dosen mereset kata sandi; mahasiswa wajib menggantinya', async () => {
  const page = await newPage();
  await login(page, 'D001');
  await heading(page, 'Dashboard Kelengkapan Log');
  const budiId = sql(`select id from public.profiles where nim = 'M002'`);
  await page.goto(`${BASE}/#/dosen/mahasiswa/${budiId}`);
  await heading(page, 'Budi Santoso');
  await page.click('button[data-action=reset-password]');
  const temp = (await page.textContent('.temp-password code')).trim();
  assert.match(temp, /^[a-z0-9]{10}$/);
  await page.context().close();

  const budi = await newPage();
  await login(budi, 'M002', temp);
  await heading(budi, 'Ubah kata sandi');
  await budi.goto(`${BASE}/#/mahasiswa/log-pribadi`);
  await budi.waitForURL(/#\/akun\/password$/);
  await heading(budi, 'Ubah kata sandi');
  await budi.fill('input[name=current]', temp);
  await budi.fill('input[name=next]', 'kataSandiBaru1');
  await budi.fill('input[name=confirm]', 'kataSandiBaru1');
  await budi.click('form[data-action=change-password] button[type=submit]');
  await heading(budi, 'Halo, Budi');
  await budi.context().close();
  await apiAs('M002', 'kataSandiBaru1');
});

test('dashboard menghitung lebih dari 1000 log (paginasi) dan dapat diunduh', async () => {
  const citraId = sql(`select id from public.profiles where nim = 'M003'`);
  sql(`insert into public.personal_logs (user_id, log_date, activity)
       select '${citraId}', current_date - (g % 20), 'log ' || g from generate_series(1, 1200) g`);
  const page = await newPage();
  await login(page, 'D001');
  await heading(page, 'Dashboard Kelengkapan Log');
  const row = page.locator('tr', { hasText: 'Citra Dewi' });
  await row.waitFor();
  assert.match(await row.textContent(), /1200/);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('button[data-action=csv]')]);
  assert.equal(download.suggestedFilename(), 'kelengkapan-log.csv');

  await page.selectOption('select[name=lingkup]', 'bimbingan');
  await page.click('form[data-action=filter] button[type=submit]');
  await page.waitForURL(/lingkup=bimbingan/);
  // Citra (K-02) bukan bimbingan dosen ini, jadi barisnya harus hilang.
  await row.waitFor({ state: 'detached' });
  assert.match(await mainText(page), /Ani Lestari/);
  await page.context().close();
});

test('dosen menghapus akun mahasiswa', async () => {
  const page = await newPage();
  await login(page, 'D001');
  await heading(page, 'Dashboard Kelengkapan Log');
  const citraId = sql(`select id from public.profiles where nim = 'M003'`);
  await page.goto(`${BASE}/#/dosen/mahasiswa/${citraId}`);
  await heading(page, 'Citra Dewi');
  await page.click('button[data-action=delete-student]');
  await page.waitForSelector('.alert-success');
  assert.equal(sql(`select count(*) from auth.users where id = '${citraId}'`), '0');
  assert.equal(sql(`select count(*) from public.personal_logs where user_id = '${citraId}'`), '0');
  await page.context().close();
});
