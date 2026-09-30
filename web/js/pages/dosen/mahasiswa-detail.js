import { html } from '../../lib/html.js';
import { completeness, completenessLevel } from '../../lib/period.js';
import { sb, q, fetchAll, UserError } from '../../api.js';
import { logCard, weekStrip, documentTable, levelBadge, percentText, formErrors } from '../../components.js';
import { allGroups, reviewLog, topicsQuery } from './data.js';

export default {
  title: 'Detail Mahasiswa',
  async load({ params, settings }) {
    const student = await q(sb.from('profiles').select('*').eq('id', params.id).eq('role', 'mahasiswa').maybeSingle());
    if (!student) throw new UserError('Mahasiswa tidak ditemukan.');
    const [logs, documents, materials, progress, topics, groups] = await Promise.all([
      fetchAll(() => sb.from('personal_logs').select('*').eq('user_id', student.id).order('log_date', { ascending: false }).order('id', { ascending: false })),
      q(sb.from('documents').select('*').eq('owner_id', student.id).order('created_at', { ascending: false })),
      q(sb.from('materials').select('id, title, topic_id').order('id')),
      q(sb.from('material_progress').select('material_id').eq('user_id', student.id)),
      q(topicsQuery()),
      allGroups(),
    ]);
    const done = new Set(progress.map((p) => p.material_id));
    const topicOrder = new Map(topics.map((t, i) => [t.id, i]));
    const stats = completeness(logs.map((l) => l.log_date), settings, settings.min_personal_logs_per_week);
    return {
      title: student.name,
      student,
      group: groups.find((g) => g.id === student.group_id) ?? null,
      groups,
      logs,
      documents,
      stats: { ...stats, level: completenessLevel(stats.percent) },
      materials: materials
        .map((m) => ({ ...m, done: done.has(m.id) }))
        .sort((a, b) => (topicOrder.get(a.topic_id) ?? 0) - (topicOrder.get(b.topic_id) ?? 0) || a.id - b.id),
      tempPassword: null,
    };
  },
  view(d) {
    const s = d.student;
    return html`
      <p class="small"><a href="#/dosen">← Dashboard</a></p>
      <div class="page-head">
        <div>
          <h1>${s.name}</h1>
          <p class="muted">${s.nim}${s.prodi ? ` · ${s.prodi}` : ''} ·
            ${d.group ? html`Kelompok <a href="#/dosen/kelompok/${d.group.id}">${d.group.name}</a>` : 'Tanpa kelompok'}</p>
        </div>
        <div class="stat compact">
          <span class="stat-label">Kelengkapan</span>
          <span class="stat-value">${percentText(d.stats.percent)}</span>
          ${levelBadge(d.stats.level)}
        </div>
      </div>
      <section class="card"><h2>Log pribadi per minggu</h2>${weekStrip(d.stats.weeks)}</section>
      <div class="layout-split wide-right">
        <aside>
          <section class="card">
            <h2>Dokumen (${d.documents.length})</h2>
            ${documentTable(d.documents)}
          </section>
          <section class="card">
            <h2>Materi</h2>
            <p class="small muted">${d.materials.filter((m) => m.done).length} dari ${d.materials.length} selesai</p>
            <ul class="material-list compact">${d.materials.map(
              (m) => html`<li class="${m.done ? 'done' : ''}"><span class="check">${m.done ? '✓' : ''}</span>${m.title}</li>`
            )}</ul>
          </section>
          <section class="card">
            <h2>Data akun</h2>
            <form data-action="update-student" class="stack">
              ${formErrors()}
              <label>Nama <input name="name" value="${s.name}" maxlength="100" required></label>
              <label>Prodi <input name="prodi" value="${s.prodi ?? ''}" maxlength="100"></label>
              <label>Kelompok
                <select name="group_id"><option value="">—</option>
                  ${d.groups.map((g) => html`<option value="${g.id}" ${g.id === s.group_id ? 'selected' : ''}>${g.name}</option>`)}
                </select>
              </label>
              <button class="btn btn-small btn-primary" type="submit">Simpan</button>
            </form>
            <div class="temp-password"></div>
            <div class="actions">
              <button type="button" class="btn btn-small" data-action="reset-password" data-id="${s.id}"
                data-confirm="Buat kata sandi sementara baru untuk mahasiswa ini?">Reset kata sandi</button>
              <button type="button" class="btn btn-small btn-danger" data-action="delete-student" data-id="${s.id}"
                data-confirm="Hapus akun beserta seluruh log dan dokumennya? Tindakan ini tidak dapat dibatalkan.">Hapus akun</button>
            </div>
          </section>
        </aside>
        <section>
          <h2>Log pribadi (${d.logs.length})</h2>
          ${d.logs.length ? '' : html`<p class="muted card">Belum ada log.</p>`}
          ${d.logs.map((log) => logCard(log, { review: 'review' }))}
        </section>
      </div>`;
  },
  actions: {
    review: (values) => reviewLog('personal_logs', values),
    async 'update-student'(values, { params }) {
      const name = values.name.trim();
      if (!name) throw new UserError('Nama wajib diisi.');
      await q(sb.from('profiles').update({ name, prodi: values.prodi.trim() || null, group_id: Number(values.group_id) || null }).eq('id', params.id));
      return { flash: 'Data mahasiswa diperbarui.' };
    },
    async 'reset-password'({ id }, { el }) {
      const password = await q(sb.rpc('reset_student_password', { p_user: id }));
      const box = el.closest('section').querySelector('.temp-password');
      box.innerHTML = html`<div class="alert alert-info">Kata sandi sementara: <code class="mono">${password}</code><br>
        <span class="small">Hanya ditampilkan sekali. Mahasiswa wajib menggantinya saat masuk.</span></div>`.toString();
      return { stay: true };
    },
    async 'delete-student'({ id }) {
      await q(sb.rpc('delete_student', { p_user: id }));
      return { navigate: '/dosen', flash: 'Akun mahasiswa dihapus.' };
    },
  },
};
