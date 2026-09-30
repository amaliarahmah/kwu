import { html } from '../../lib/html.js';
import { completeness, completenessLevel } from '../../lib/period.js';
import { formatDate } from '../../lib/format.js';
import { statusBadge, multiline, weekStrip, levelBadge, percentText } from '../../components.js';
import { ownLogs, groupLogs, groupInfo, materialsWithProgress } from './data.js';

export default {
  title: 'Beranda',
  async load({ profile, settings }) {
    const [logs, gLogs, group, materials] = await Promise.all([
      ownLogs(profile), groupLogs(profile), groupInfo(profile), materialsWithProgress(profile),
    ]);
    const feedback = [
      ...logs.filter((l) => l.feedback).map((l) => ({ ...l, kind: 'Log pribadi', link: '#/mahasiswa/log-pribadi' })),
      ...gLogs.filter((l) => l.feedback).map((l) => ({ ...l, kind: 'Log kelompok', link: '#/mahasiswa/log-kelompok' })),
    ]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 5);
    return {
      group,
      personal: completeness(logs.map((l) => l.log_date), settings, settings.min_personal_logs_per_week),
      groupStats: group ? completeness(gLogs.map((l) => l.log_date), settings, settings.min_group_logs_per_week) : null,
      materialsDone: materials.filter((m) => m.completed_at).length,
      materialsTotal: materials.length,
      revisionCount: [...logs, ...gLogs].filter((l) => l.status === 'revisi').length,
      feedback,
    };
  },
  view(d, { profile, settings }) {
    const level = completenessLevel(d.personal.percent);
    const current = d.personal.currentWeek ? d.personal.weeks[d.personal.currentWeek - 1] : null;
    return html`
      <div class="page-head">
        <div>
          <h1>Halo, ${profile.name.split(' ')[0]}</h1>
          <p class="muted">${settings.program_name} ·
            ${d.group ? `Kelompok ${d.group.name}${d.group.business_name ? ` — ${d.group.business_name}` : ''}` : 'Belum tergabung dalam kelompok'}</p>
        </div>
        <div class="actions">
          <a class="btn btn-primary" href="#/mahasiswa/log-pribadi">+ Isi log pribadi</a>
          ${d.group ? html`<a class="btn" href="#/mahasiswa/log-kelompok">+ Isi log kelompok</a>` : ''}
        </div>
      </div>

      <div class="stats">
        <div class="stat">
          <span class="stat-label">Kelengkapan log pribadi</span>
          <span class="stat-value">${percentText(d.personal.percent)}</span>
          ${levelBadge(level)}
        </div>
        <div class="stat">
          <span class="stat-label">Minggu berjalan</span>
          <span class="stat-value">${d.personal.currentWeek ?? '–'}<small> / ${settings.period_weeks}</small></span>
          <span class="small muted">${current ? `${current.count} dari ${settings.min_personal_logs_per_week} log minggu ini` : 'Di luar periode kegiatan'}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Materi dipelajari</span>
          <span class="stat-value">${d.materialsDone}<small> / ${d.materialsTotal}</small></span>
          <a class="small" href="#/mahasiswa/materi">Buka materi →</a>
        </div>
        <div class="stat ${d.revisionCount ? 'stat-warn' : ''}">
          <span class="stat-label">Log perlu revisi</span>
          <span class="stat-value">${d.revisionCount}</span>
          <span class="small muted">dari catatan dosen</span>
        </div>
      </div>

      <section class="card">
        <h2>Log pribadi per minggu</h2>
        <p class="small muted">Target: minimal ${settings.min_personal_logs_per_week} log per minggu. Periode mulai ${formatDate(settings.period_start)}.</p>
        ${weekStrip(d.personal.weeks)}
      </section>

      ${d.groupStats
        ? html`<section class="card">
            <h2>Log kelompok per minggu</h2>
            <p class="small muted">Target: minimal ${settings.min_group_logs_per_week} log kelompok per minggu. Pembimbing: ${d.group.mentor?.name ?? 'belum ditentukan'}.</p>
            ${weekStrip(d.groupStats.weeks)}
          </section>`
        : ''}

      <section class="card">
        <h2>Catatan dosen terbaru</h2>
        ${d.feedback.length
          ? html`<ul class="feed">${d.feedback.map(
              (f) => html`<li>
                <div><strong>${f.activity}</strong> <span class="muted small">· ${f.kind} · ${formatDate(f.log_date)}</span> ${statusBadge(f.status)}</div>
                ${multiline(f.feedback)}
                <a class="small" href="${f.link}">Lihat log →</a>
              </li>`
            )}</ul>`
          : html`<p class="muted">Belum ada catatan dari dosen.</p>`}
      </section>`;
  },
};
