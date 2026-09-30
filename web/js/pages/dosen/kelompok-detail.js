import { html } from '../../lib/html.js';
import { completeness, completenessLevel } from '../../lib/period.js';
import { sb, q, fetchAll, UserError } from '../../api.js';
import { logCard, weekStrip, documentTable, levelBadge, percentText, multiline } from '../../components.js';
import { reviewLog } from './data.js';

export default {
  title: 'Detail Kelompok',
  async load({ params, settings }) {
    const group = await q(sb.from('groups').select('*, mentor:profiles!groups_mentor_id_fkey(name)').eq('id', params.id).maybeSingle());
    if (!group) throw new UserError('Kelompok tidak ditemukan.');
    const [logs, members, documents] = await Promise.all([
      fetchAll(() =>
        sb.from('group_logs').select('*, author:profiles!group_logs_author_id_fkey(name)')
          .eq('group_id', group.id).order('log_date', { ascending: false }).order('id', { ascending: false })
      ),
      q(sb.from('profiles').select('id, nim, name').eq('group_id', group.id).eq('role', 'mahasiswa').order('name')),
      q(sb.from('documents').select('*, owner:profiles!documents_owner_id_fkey(name)').eq('group_id', group.id).eq('scope', 'kelompok').order('created_at', { ascending: false })),
    ]);
    const stats = completeness(logs.map((l) => l.log_date), settings, settings.min_group_logs_per_week);
    return { title: `Kelompok ${group.name}`, group, logs, members, documents, stats: { ...stats, level: completenessLevel(stats.percent) } };
  },
  view({ group, logs, members, documents, stats }) {
    return html`
      <p class="small"><a href="#/dosen">← Dashboard</a></p>
      <div class="page-head">
        <div>
          <h1>Kelompok ${group.name}</h1>
          <p class="muted">${group.business_name || 'Nama usaha belum diisi'} · Pembimbing: ${group.mentor?.name ?? 'belum ditentukan'}</p>
          ${multiline(group.business_desc)}
        </div>
        <div class="stat compact">
          <span class="stat-label">Kelengkapan</span>
          <span class="stat-value">${percentText(stats.percent)}</span>
          ${levelBadge(stats.level)}
        </div>
      </div>
      <section class="card"><h2>Log kelompok per minggu</h2>${weekStrip(stats.weeks)}</section>
      <div class="layout-split wide-right">
        <aside>
          <section class="card">
            <h2>Anggota (${members.length})</h2>
            <ul class="plain">${members.map(
              (m) => html`<li><a href="#/dosen/mahasiswa/${m.id}">${m.name}</a> <span class="small muted">${m.nim}</span></li>`
            )}</ul>
          </section>
          <section class="card"><h2>Dokumen kelompok (${documents.length})</h2>${documentTable(documents, { showOwner: true })}</section>
        </aside>
        <section>
          <h2>Log kelompok (${logs.length})</h2>
          ${logs.length ? '' : html`<p class="muted card">Belum ada log.</p>`}
          ${logs.map((log) => logCard(log, { showAuthor: true, review: 'review' }))}
        </section>
      </div>`;
  },
  actions: {
    review: (values) => reviewLog('group_logs', values),
  },
};
