import { html } from '../../lib/html.js';
import { periodProgress } from '../../lib/period.js';
import { formatDate, toCsv } from '../../lib/format.js';
import { downloadFile } from '../../lib/download.js';
import { sb, fetchAll } from '../../api.js';
import { meter } from '../../components.js';
import { allGroups, students as loadStudents, summarize, groupBy } from './data.js';

const LEVELS = [['baik', 'Lengkap'], ['sedang', 'Kurang'], ['rendah', 'Tertinggal'], ['na', 'Belum dinilai']];

export default {
  title: 'Dashboard Kelengkapan',
  async load({ settings, query, profile }) {
    const scope = query.lingkup === 'bimbingan' ? 'bimbingan' : 'semua';
    const groupFilter = Number(query.kelompok) || null;
    const [groups, studentRows, personal, group, docs, progress, materials] = await Promise.all([
      allGroups(),
      loadStudents(),
      fetchAll(() => sb.from('personal_logs').select('user_id, log_date, status').order('id')),
      fetchAll(() => sb.from('group_logs').select('group_id, log_date, status').order('id')),
      fetchAll(() => sb.from('documents').select('owner_id, group_id, scope').order('id')),
      fetchAll(() => sb.from('material_progress').select('user_id').order('user_id')),
      fetchAll(() => sb.from('materials').select('id').order('id')),
    ]);
    const groupById = new Map(groups.map((g) => [g.id, g]));
    const inScope = (groupId) =>
      (scope === 'semua' || groupById.get(groupId)?.mentor_id === profile.id) && (!groupFilter || groupId === groupFilter);

    const personalBy = groupBy(personal, 'user_id');
    const groupLogsBy = groupBy(group, 'group_id');
    const docsBy = groupBy(docs, 'owner_id');
    const groupDocsBy = groupBy(docs.filter((d) => d.scope === 'kelompok'), 'group_id');
    const progressBy = groupBy(progress, 'user_id');
    const memberCount = groupBy(studentRows, 'group_id');

    const students = studentRows
      .filter((s) => inScope(s.group_id))
      .map((s) => ({
        ...s,
        groupName: groupById.get(s.group_id)?.name ?? '',
        stats: summarize(personalBy.get(s.id) ?? [], settings, settings.min_personal_logs_per_week),
        documents: docsBy.get(s.id)?.length ?? 0,
        materialsDone: progressBy.get(s.id)?.length ?? 0,
      }))
      .sort((a, b) => a.groupName.localeCompare(b.groupName) || a.name.localeCompare(b.name));

    const groupRows = groups
      .filter((g) => inScope(g.id))
      .map((g) => ({
        ...g,
        members: memberCount.get(g.id)?.length ?? 0,
        stats: summarize(groupLogsBy.get(g.id) ?? [], settings, settings.min_group_logs_per_week),
        documents: groupDocsBy.get(g.id)?.length ?? 0,
      }));

    const levelCount = (list) => list.reduce((acc, i) => ({ ...acc, [i.stats.level.key]: (acc[i.stats.level.key] ?? 0) + 1 }), {});
    return {
      scope, groupFilter, groups, students, groupRows,
      materialTotal: materials.length,
      progress: periodProgress(settings),
      studentLevels: levelCount(students),
      groupLevels: levelCount(groupRows),
      pendingTotal: [...students, ...groupRows].reduce((a, i) => a + i.stats.pending, 0),
    };
  },
  view(d, { settings }) {
    const levelBadges = (counts) =>
      LEVELS.map(([k, l]) => (counts[k] ? html`<span class="badge level-${k}">${counts[k]} ${l}</span>` : ''));
    return html`
      <div class="page-head">
        <div>
          <h1>Dashboard Kelengkapan Log</h1>
          <p class="muted">${settings.program_name} ·
            ${d.progress.currentWeek
              ? `Minggu ke-${d.progress.currentWeek} dari ${settings.period_weeks}`
              : d.progress.finished ? 'Periode telah berakhir' : `Periode belum dimulai (mulai ${formatDate(settings.period_start)})`}
            · dinilai dari ${d.progress.completedWeeks} minggu yang sudah selesai</p>
        </div>
        <div class="actions">
          <a class="btn" href="#/dosen/antrian">Pemeriksaan (${d.pendingTotal})</a>
          <button class="btn" type="button" data-action="csv">Unduh CSV</button>
        </div>
      </div>

      <form class="filters card" data-action="filter">
        <label>Lingkup
          <select name="lingkup">
            <option value="semua">Semua kelompok</option>
            <option value="bimbingan" ${d.scope === 'bimbingan' ? 'selected' : ''}>Kelompok bimbingan saya</option>
          </select>
        </label>
        <label>Kelompok
          <select name="kelompok">
            <option value="">Semua</option>
            ${d.groups.map((g) => html`<option value="${g.id}" ${d.groupFilter === g.id ? 'selected' : ''}>${g.name}</option>`)}
          </select>
        </label>
        <button class="btn" type="submit">Terapkan</button>
        <p class="small muted">Target per minggu: ${settings.min_personal_logs_per_week} log pribadi, ${settings.min_group_logs_per_week} log kelompok.
          Lengkap ≥ 80%, Kurang 50–79%, Tertinggal &lt; 50%.</p>
      </form>

      <div class="stats">
        <div class="stat"><span class="stat-label">Mahasiswa</span><span class="stat-value">${d.students.length}</span>
          <div class="level-row">${levelBadges(d.studentLevels)}</div></div>
        <div class="stat"><span class="stat-label">Kelompok</span><span class="stat-value">${d.groupRows.length}</span>
          <div class="level-row">${levelBadges(d.groupLevels)}</div></div>
        <div class="stat ${d.pendingTotal ? 'stat-warn' : ''}"><span class="stat-label">Log menunggu pemeriksaan</span>
          <span class="stat-value">${d.pendingTotal}</span><a class="small" href="#/dosen/antrian">Periksa sekarang →</a></div>
        <div class="stat"><span class="stat-label">Materi tersedia</span><span class="stat-value">${d.materialTotal}</span>
          <a class="small" href="#/dosen/materi">Kelola materi →</a></div>
      </div>

      <section class="card flush">
        <h2>Kelengkapan log individu</h2>
        ${d.students.length
          ? html`<div class="table-wrap"><table>
              <thead><tr><th>Mahasiswa</th><th>Kelompok</th><th class="num">Log</th><th class="num">Minggu terpenuhi</th>
                <th>Kelengkapan</th><th class="num">Menunggu</th><th class="num">Dokumen</th><th class="num">Materi</th><th>Log terakhir</th></tr></thead>
              <tbody>${d.students.map(
                (s) => html`<tr>
                  <td><a href="#/dosen/mahasiswa/${s.id}">${s.name}</a><div class="small muted">${s.nim}</div></td>
                  <td>${s.groupName || '-'}</td>
                  <td class="num">${s.stats.total}</td>
                  <td class="num">${s.stats.weeksMet} / ${s.stats.completedWeeks}</td>
                  <td>${meter(s.stats)}</td>
                  <td class="num">${s.stats.pending || ''}</td>
                  <td class="num">${s.documents}</td>
                  <td class="num">${s.materialsDone}/${d.materialTotal}</td>
                  <td class="nowrap">${s.stats.lastDate ? formatDate(s.stats.lastDate) : '-'}</td>
                </tr>`
              )}</tbody></table></div>`
          : html`<p class="pad muted">Belum ada mahasiswa yang mengaktifkan akun. <a href="#/dosen/kelola">Kelola peserta</a>.</p>`}
      </section>

      <section class="card flush">
        <h2>Kelengkapan log kelompok</h2>
        ${d.groupRows.length
          ? html`<div class="table-wrap"><table>
              <thead><tr><th>Kelompok</th><th>Pembimbing</th><th class="num">Anggota</th><th class="num">Log</th>
                <th class="num">Minggu terpenuhi</th><th>Kelengkapan</th><th class="num">Menunggu</th><th class="num">Dokumen</th><th>Log terakhir</th></tr></thead>
              <tbody>${d.groupRows.map(
                (g) => html`<tr>
                  <td><a href="#/dosen/kelompok/${g.id}">${g.name}</a><div class="small muted">${g.business_name ?? ''}</div></td>
                  <td class="small">${g.mentor?.name ?? '-'}</td>
                  <td class="num">${g.members}</td>
                  <td class="num">${g.stats.total}</td>
                  <td class="num">${g.stats.weeksMet} / ${g.stats.completedWeeks}</td>
                  <td>${meter(g.stats)}</td>
                  <td class="num">${g.stats.pending || ''}</td>
                  <td class="num">${g.documents}</td>
                  <td class="nowrap">${g.stats.lastDate ? formatDate(g.stats.lastDate) : '-'}</td>
                </tr>`
              )}</tbody></table></div>`
          : html`<p class="pad muted">Belum ada kelompok.</p>`}
      </section>`;
  },
  actions: {
    async filter(values, { navigate }) {
      const params = new URLSearchParams();
      if (values.lingkup === 'bimbingan') params.set('lingkup', 'bimbingan');
      if (values.kelompok) params.set('kelompok', values.kelompok);
      navigate(`/dosen${params.size ? `?${params}` : ''}`);
      return { stay: true };
    },
    async csv(values, { data }) {
      const pct = (p) => (p === null ? '' : p);
      const rows = [
        ...data.students.map((s) => ['Individu', s.nim, s.name, s.groupName, s.stats.total, s.stats.weeksMet,
          s.stats.completedWeeks, pct(s.stats.percent), s.stats.level.label, s.stats.pending, s.documents, s.stats.lastDate]),
        ...data.groupRows.map((g) => ['Kelompok', '', g.name, g.business_name ?? '', g.stats.total, g.stats.weeksMet,
          g.stats.completedWeeks, pct(g.stats.percent), g.stats.level.label, g.stats.pending, g.documents, g.stats.lastDate]),
      ];
      downloadFile('kelengkapan-log.csv', toCsv(['Jenis', 'NIM', 'Nama', 'Kelompok/Usaha', 'Jumlah log', 'Minggu terpenuhi',
        'Minggu dinilai', 'Kelengkapan (%)', 'Status', 'Menunggu review', 'Dokumen', 'Log terakhir'], rows));
      return { stay: true };
    },
  },
};
