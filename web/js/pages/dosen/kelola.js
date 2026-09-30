import { html } from '../../lib/html.js';
import { parseRoster } from '../../lib/format.js';
import { readSettings } from '../../lib/validate.js';
import { sb, q, fetchAll, UserError } from '../../api.js';
import { formErrors } from '../../components.js';
import { allGroups, lecturers, students, groupBy } from './data.js';

const str = (v, max) => String(v ?? '').trim().slice(0, max);

const groupFields = (g, mentors, defaultMentor) => html`
  <div class="grid-3">
    <label>Nama kelompok <input name="name" maxlength="100" value="${g.name ?? ''}" required placeholder="mis. K-01"></label>
    <label>Nama usaha <input name="business_name" maxlength="200" value="${g.business_name ?? ''}"></label>
    <label>Dosen pembimbing
      <select name="mentor_id"><option value="">—</option>
        ${mentors.map((l) => html`<option value="${l.id}" ${l.id === (g.mentor_id ?? defaultMentor) ? 'selected' : ''}>${l.name}</option>`)}
      </select>
    </label>
  </div>
  <label>Deskripsi usaha <textarea name="business_desc" rows="2" maxlength="2000">${g.business_desc ?? ''}</textarea></label>`;

const groupRow = (values) => ({
  name: str(values.name, 100),
  business_name: str(values.business_name, 200) || null,
  business_desc: str(values.business_desc, 2000) || null,
  mentor_id: values.mentor_id || null,
});

export default {
  title: 'Kelola Data',
  async load() {
    const [groups, mentors, active, pending] = await Promise.all([
      allGroups(),
      lecturers(),
      students(),
      fetchAll(() => sb.from('roster').select('*').is('claimed_by', null).order('created_at').order('nim')),
    ]);
    const members = groupBy(active, 'group_id');
    return { groups: groups.map((g) => ({ ...g, members: members.get(g.id)?.length ?? 0 })), mentors, active, pending };
  },
  view(d, { settings, profile }) {
    const groupName = (id) => d.groups.find((g) => g.id === id)?.name ?? '-';
    const groupOptions = (selected) =>
      html`<option value="">—</option>${d.groups.map((g) => html`<option value="${g.id}" ${g.id === selected ? 'selected' : ''}>${g.name}</option>`)}`;
    return html`
      <div class="page-head"><div>
        <h1>Kelola Data</h1>
        <p class="muted">Pengaturan periode, kelompok usaha, dan peserta.</p>
      </div></div>

      <section class="card" id="pengaturan">
        <h2>Pengaturan periode</h2>
        <form data-action="save-settings">
          ${formErrors()}
          <label>Nama program <input name="program_name" maxlength="150" value="${settings.program_name}"></label>
          <div class="grid-4">
            <label>Tanggal mulai <input type="date" name="period_start" value="${settings.period_start}" required></label>
            <label>Jumlah minggu <input type="number" name="period_weeks" min="1" max="52" value="${settings.period_weeks}" required></label>
            <label>Min. log pribadi / minggu <input type="number" name="min_personal_logs_per_week" min="1" max="14" value="${settings.min_personal_logs_per_week}" required></label>
            <label>Min. log kelompok / minggu <input type="number" name="min_group_logs_per_week" min="1" max="14" value="${settings.min_group_logs_per_week}" required></label>
          </div>
          <button class="btn btn-primary" type="submit">Simpan pengaturan</button>
        </form>
      </section>

      <section class="card" id="peserta">
        <h2>Tambah peserta</h2>
        <p class="small muted">Setiap peserta mendapat <strong>kode aktivasi</strong>. Bagikan kode kepada peserta; mereka membuka
          aplikasi → "Aktifkan akun" → isi NIM, kode, dan kata sandi sendiri.</p>
        <div class="grid-2">
          <form data-action="import" class="stack">
            <h3>Impor banyak sekaligus</h3>
            ${formErrors()}
            <label>Satu peserta per baris: <code>NIM;Nama;Kelompok;Prodi</code>
              <textarea name="bulk" rows="7" placeholder="2301001;Ani Lestari;K-01;Manajemen&#10;2301002;Budi Santoso;K-01;Akuntansi"></textarea>
            </label>
            <p class="small muted">Bisa disalin langsung dari Excel (kolom dipisah tab). Kelompok yang belum ada dibuat otomatis.</p>
            <button class="btn btn-primary" type="submit">Impor</button>
          </form>
          <form data-action="add-person" class="stack">
            <h3>Tambah satu peserta</h3>
            ${formErrors()}
            <label>NIM / NIDN <input name="nim" maxlength="30" required pattern="[A-Za-z0-9._\\-]{3,30}"></label>
            <label>Nama lengkap <input name="name" maxlength="100" required></label>
            <div class="grid-2">
              <label>Peran
                <select name="role"><option value="mahasiswa">Mahasiswa</option><option value="dosen">Dosen</option></select>
              </label>
              <label>Kelompok <select name="group_id">${groupOptions(null)}</select></label>
            </div>
            <label>Program studi <input name="prodi" maxlength="100"></label>
            <button class="btn btn-primary" type="submit">Tambah</button>
          </form>
        </div>
      </section>

      <section class="card" id="kode">
        <div class="topic-head">
          <h2>Belum aktivasi (${d.pending.length})</h2>
          ${d.pending.length ? html`<button class="btn btn-small no-print" type="button" data-global="print">Cetak daftar kode</button>` : ''}
        </div>
        ${d.pending.length
          ? html`<div class="table-wrap"><table>
              <thead><tr><th>NIM/NIDN</th><th>Nama</th><th>Peran</th><th>Kelompok</th><th>Kode aktivasi</th><th class="no-print"></th></tr></thead>
              <tbody>${d.pending.map(
                (r) => html`<tr>
                  <td>${r.nim}</td><td>${r.name}</td><td>${r.role}</td><td>${groupName(r.group_id)}</td>
                  <td><code class="mono">${r.activation_code}</code></td>
                  <td class="no-print"><div class="actions">
                    <button type="button" class="btn btn-small" data-action="new-code" data-nim="${r.nim}">Kode baru</button>
                    <button type="button" class="btn btn-small btn-danger" data-action="delete-roster" data-nim="${r.nim}"
                      data-confirm="Hapus peserta ini dari daftar?">Hapus</button>
                  </div></td>
                </tr>`
              )}</tbody></table></div>`
          : html`<p class="muted">Semua peserta sudah mengaktifkan akun.</p>`}
      </section>

      <section class="card" id="kelompok">
        <h2>Kelompok usaha (${d.groups.length})</h2>
        <details>
          <summary><strong>+ Tambah kelompok</strong></summary>
          <form data-action="add-group" class="stack">${formErrors()}${groupFields({}, d.mentors, profile.id)}
            <button class="btn btn-primary" type="submit">Tambah kelompok</button>
          </form>
        </details>
        ${d.groups.length
          ? html`<div class="table-wrap"><table>
              <thead><tr><th>Kelompok</th><th>Usaha</th><th>Pembimbing</th><th class="num">Anggota aktif</th><th></th></tr></thead>
              <tbody>${d.groups.map(
                (g) => html`<tr>
                  <td><a href="#/dosen/kelompok/${g.id}">${g.name}</a></td>
                  <td>${g.business_name ?? '-'}</td>
                  <td>${g.mentor?.name ?? '-'}</td>
                  <td class="num">${g.members}</td>
                  <td><details><summary class="small">Ubah</summary>
                    <form data-action="update-group" class="stack">
                      ${formErrors()}
                      <input type="hidden" name="id" value="${g.id}">
                      ${groupFields(g, d.mentors)}
                      <button class="btn btn-small btn-primary" type="submit">Simpan</button>
                    </form>
                    <button type="button" class="btn btn-small btn-danger" data-action="delete-group" data-id="${g.id}"
                      data-confirm="Hapus kelompok ini? Log dan dokumen kelompok ikut terhapus.">Hapus kelompok</button>
                  </details></td>
                </tr>`
              )}</tbody></table></div>`
          : ''}
      </section>

      <section class="card" id="aktif">
        <h2>Mahasiswa aktif (${d.active.length})</h2>
        ${d.active.length
          ? html`<div class="table-wrap"><table>
              <thead><tr><th>NIM</th><th>Nama</th><th>Prodi</th><th>Kelompok</th></tr></thead>
              <tbody>${d.active.map(
                (s) => html`<tr><td>${s.nim}</td><td><a href="#/dosen/mahasiswa/${s.id}">${s.name}</a></td>
                  <td>${s.prodi ?? '-'}</td><td>${groupName(s.group_id)}</td></tr>`
              )}</tbody></table></div>
            <p class="small muted">Untuk mengubah data, reset kata sandi, atau menghapus akun, buka nama mahasiswa.</p>`
          : html`<p class="muted">Belum ada mahasiswa yang mengaktifkan akun.</p>`}
      </section>`;
  },
  actions: {
    async 'save-settings'(values) {
      const { row, errors } = readSettings(values);
      if (errors.length) throw new UserError(errors);
      await q(sb.from('settings').update(row).eq('id', 1));
      return { flash: 'Pengaturan periode disimpan.' };
    },
    async import(values) {
      const rows = parseRoster(values.bulk);
      if (!rows.length) throw new UserError('Tempel minimal satu baris data.');
      const result = await q(sb.rpc('import_roster', { p_rows: rows }));
      const ok = result.filter((r) => r.status === 'ok').length;
      const failed = result.filter((r) => r.status !== 'ok');
      if (failed.length) {
        throw new UserError([
          `${ok} peserta ditambahkan. ${failed.length} baris gagal:`,
          ...failed.slice(0, 15).map((r) => `${r.nim || '(kosong)'} — ${r.status}`),
        ]);
      }
      return { flash: `${ok} peserta ditambahkan. Kode aktivasi ada di tabel "Belum aktivasi".` };
    },
    async 'add-person'(values) {
      const nim = str(values.nim, 30);
      const name = str(values.name, 100);
      if (!/^[A-Za-z0-9._-]{3,30}$/.test(nim)) throw new UserError('NIM/NIDN hanya boleh huruf, angka, titik, garis (3–30 karakter).');
      if (!name) throw new UserError('Nama wajib diisi.');
      await q(sb.from('roster').insert({
        nim, name,
        role: values.role === 'dosen' ? 'dosen' : 'mahasiswa',
        prodi: str(values.prodi, 100) || null,
        group_id: Number(values.group_id) || null,
      }));
      return { flash: `${name} ditambahkan. Kode aktivasi ada di tabel "Belum aktivasi".` };
    },
    async 'new-code'({ nim }) {
      const code = await q(sb.rpc('gen_activation_code'));
      await q(sb.from('roster').update({ activation_code: code }).eq('nim', nim));
      return { flash: `Kode aktivasi baru untuk ${nim} dibuat.` };
    },
    async 'delete-roster'({ nim }) {
      await q(sb.from('roster').delete().eq('nim', nim));
      return { flash: 'Peserta dihapus dari daftar.' };
    },
    async 'add-group'(values) {
      const row = groupRow(values);
      if (!row.name) throw new UserError('Nama kelompok wajib diisi.');
      await q(sb.from('groups').insert(row));
      return { flash: `Kelompok "${row.name}" dibuat.` };
    },
    async 'update-group'(values) {
      const row = groupRow(values);
      if (!row.name) throw new UserError('Nama kelompok wajib diisi.');
      await q(sb.from('groups').update(row).eq('id', values.id));
      return { flash: 'Kelompok diperbarui.' };
    },
    async 'delete-group'({ id }) {
      await q(sb.from('groups').delete().eq('id', id));
      return { flash: 'Kelompok dihapus.' };
    },
  },
};
