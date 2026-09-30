import { html } from '../../lib/html.js';
import { completeness } from '../../lib/period.js';
import { formatDate, formatHours, toCsv } from '../../lib/format.js';
import { percentText, logTable } from '../../components.js';
import { downloadFile } from '../../lib/download.js';
import { ownLogs, groupLogs, groupInfo, visibleDocuments } from './data.js';

const STATE_LABEL = { terpenuhi: 'Terpenuhi', kurang: 'Kurang', berjalan: 'Berjalan', 'akan-datang': '–' };

export default {
  title: 'Rekapitulasi',
  async load({ profile, settings }) {
    const [logs, gLogs, group, documents] = await Promise.all([
      ownLogs(profile), groupLogs(profile), groupInfo(profile), visibleDocuments(),
    ]);
    const personal = completeness(logs.map((l) => l.log_date), settings, settings.min_personal_logs_per_week);
    const groupStats = completeness(gLogs.map((l) => l.log_date), settings, settings.min_group_logs_per_week);
    const sum = (list) => list.reduce((acc, l) => acc + Number(l.duration_hours ?? 0), 0);
    const count = (list, s) => list.filter((l) => l.status === s).length;
    return {
      logs, gLogs, group, personal,
      groupStats: group ? groupStats : null,
      weeks: personal.weeks.map((w, i) => ({ ...w, groupCount: groupStats.weeks[i].count, groupState: groupStats.weeks[i].state })),
      summary: {
        personalHours: sum(logs),
        personalApproved: count(logs, 'disetujui'),
        personalRevision: count(logs, 'revisi'),
        groupApproved: count(gLogs, 'disetujui'),
        documents: documents.length,
      },
    };
  },
  view(d, { profile, settings }) {
    return html`
      <div class="page-head">
        <div>
          <h1>Rekapitulasi Log Kegiatan</h1>
          <p class="muted">${profile.name} (${profile.nim})${d.group ? ` · Kelompok ${d.group.name}` : ''} · ${settings.program_name}</p>
        </div>
        <div class="actions no-print">
          <button class="btn" type="button" data-global="print">Cetak / PDF</button>
          <button class="btn" type="button" data-action="csv">Unduh CSV</button>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><span class="stat-label">Log pribadi</span><span class="stat-value">${d.logs.length}</span>
          <span class="small muted">${d.summary.personalApproved} disetujui · ${d.summary.personalRevision} revisi</span></div>
        <div class="stat"><span class="stat-label">Jam kegiatan pribadi</span><span class="stat-value">${formatHours(d.summary.personalHours)}</span></div>
        <div class="stat"><span class="stat-label">Log kelompok</span><span class="stat-value">${d.gLogs.length}</span>
          <span class="small muted">${d.summary.groupApproved} disetujui</span></div>
        <div class="stat"><span class="stat-label">Dokumen</span><span class="stat-value">${d.summary.documents}</span></div>
      </div>

      <section class="card">
        <h2>Kelengkapan per minggu</h2>
        <p class="small muted">
          Dihitung dari minggu yang sudah selesai (${d.personal.completedWeeks} dari ${settings.period_weeks} minggu).
          Log pribadi: <strong>${percentText(d.personal.percent)}</strong>
          ${d.groupStats ? html`· Log kelompok: <strong>${percentText(d.groupStats.percent)}</strong>` : ''}
          ${d.personal.outsidePeriod ? html`· ${d.personal.outsidePeriod} log di luar periode tidak dihitung` : ''}
        </p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Minggu</th><th>Tanggal</th><th class="num">Log pribadi</th><th>Status</th>
              ${d.groupStats ? html`<th class="num">Log kelompok</th><th>Status</th>` : ''}</tr></thead>
            <tbody>${d.weeks.map(
              (w) => html`<tr>
                <td>${w.no}</td>
                <td class="nowrap">${formatDate(w.start)} – ${formatDate(w.end)}</td>
                <td class="num">${w.count}</td>
                <td><span class="badge week-badge-${w.state}">${STATE_LABEL[w.state]}</span></td>
                ${d.groupStats
                  ? html`<td class="num">${w.groupCount}</td><td><span class="badge week-badge-${w.groupState}">${STATE_LABEL[w.groupState]}</span></td>`
                  : ''}
              </tr>`
            )}</tbody>
          </table>
        </div>
      </section>
      <section class="card"><h2>Daftar log pribadi</h2>${logTable(d.logs)}</section>
      ${d.group ? html`<section class="card"><h2>Daftar log kelompok</h2>${logTable(d.gLogs, { showAuthor: true })}</section>` : ''}
      <p class="print-only small">Dicetak dari Logbook KWU.</p>`;
  },
  actions: {
    async csv(values, { profile, data }) {
      const row = (kind, l) => [kind, l.log_date, l.activity, l.description, l.outcome, l.duration_hours, l.status, l.feedback];
      const rows = [...data.logs.map((l) => row('Pribadi', l)), ...data.gLogs.map((l) => row('Kelompok', l))].sort((a, b) =>
        a[1].localeCompare(b[1])
      );
      downloadFile(
        `rekap-log-${profile.nim}.csv`,
        toCsv(['Jenis', 'Tanggal', 'Kegiatan', 'Uraian', 'Hasil', 'Durasi (jam)', 'Status', 'Catatan dosen'], rows)
      );
      return { stay: true };
    },
  },
};
