// Potongan tampilan yang dipakai bersama.
import { html } from './lib/html.js';
import { formatDate, formatHours, STATUS_LABELS } from './lib/format.js';

export const statusBadge = (status) => html`<span class="badge status-${status}">${STATUS_LABELS[status]}</span>`;

export const multiline = (text) => (text ? html`<div class="multiline">${text}</div>` : '');

export const levelBadge = (level) => html`<span class="badge level-${level.key}">${level.label}</span>`;

export const percentText = (p) => (p === null ? '–' : `${p}%`);

export const meter = (stats) => html`
  <div class="meter" title="${stats.level.label}">
    <span class="meter-bar level-bg-${stats.level.key}" data-width="${stats.percent ?? 0}"></span>
  </div>
  <span class="small">${percentText(stats.percent)} · ${stats.level.label}</span>`;

export function weekStrip(weeks) {
  return html`
    <div class="weekstrip" role="list">
      ${weeks.map(
        (w) => html`<span role="listitem" class="week week-${w.state}"
          title="Minggu ${w.no} (${formatDate(w.start)} – ${formatDate(w.end)}): ${w.count} log, ${w.state.replace('-', ' ')}">${w.no}</span>`
      )}
    </div>
    <div class="legend small muted">
      <span class="week week-terpenuhi">✓</span> terpenuhi
      <span class="week week-kurang">!</span> kurang
      <span class="week week-berjalan">…</span> berjalan
      <span class="week week-akan-datang"></span> akan datang
    </div>`;
}

export const externalLink = (url, label) =>
  html`<a href="${url}" target="_blank" rel="noopener noreferrer">${label ?? url}</a>`;

// Kartu satu log. options: { canEdit, editHref, deleteAction, showAuthor, review }
export function logCard(log, options = {}) {
  return html`
    <article class="log-item">
      <header>
        <div>
          <span class="log-date">${formatDate(log.log_date)}</span>
          <h3>${log.activity}</h3>
          <span class="small muted">
            ${formatHours(log.duration_hours)}
            ${options.subtitle ? html` · ${options.subtitle}` : ''}
            ${options.showAuthor ? html` · ditulis ${log.author?.name ?? 'anggota'}` : ''}
            ${log.attendees ? html` · hadir: ${log.attendees}` : ''}
          </span>
        </div>
        ${statusBadge(log.status)}
      </header>
      ${log.description ? html`<h4>Uraian</h4>${multiline(log.description)}` : ''}
      ${log.outcome ? html`<h4>Hasil / pembelajaran</h4>${multiline(log.outcome)}` : ''}
      ${log.feedback && !options.review
        ? html`<div class="feedback"><strong>Catatan dosen:</strong>${multiline(log.feedback)}</div>`
        : ''}
      ${options.canEdit
        ? html`<div class="actions">
            <a class="btn btn-small" href="${options.editHref}">Ubah</a>
            <button type="button" class="btn btn-small btn-danger" data-action="${options.deleteAction}"
              data-id="${log.id}" data-confirm="Hapus log ini?">Hapus</button>
          </div>`
        : ''}
      ${options.review ? reviewForm(log, options.review) : ''}
    </article>`;
}

export function reviewForm(log, action) {
  return html`
    <details ${log.status === 'menunggu' ? 'open' : ''}>
      <summary class="small">Pemeriksaan</summary>
      <form class="review-form" data-action="${action}">
        <input type="hidden" name="id" value="${log.id}">
        <div class="form-errors"></div>
        <textarea name="feedback" rows="2" maxlength="2000"
          placeholder="Catatan untuk mahasiswa (wajib bila perlu revisi)">${log.feedback ?? ''}</textarea>
        <div class="actions">
          <button type="submit" name="status" value="disetujui" class="btn btn-small btn-primary">Setujui</button>
          <button type="submit" name="status" value="revisi" class="btn btn-small btn-warning">Minta revisi</button>
          ${log.status !== 'menunggu'
            ? html`<button type="submit" name="status" value="menunggu" class="btn btn-small">Batalkan</button>`
            : ''}
        </div>
      </form>
    </details>`;
}

export function logFields(form, { withAttendees = false } = {}) {
  return html`
    <div class="grid-2">
      <label>Tanggal kegiatan
        <input type="date" name="log_date" value="${form.log_date ?? ''}" required>
      </label>
      <label>Durasi (jam)
        <input type="number" name="duration_hours" min="0" max="24" step="0.5" value="${form.duration_hours ?? ''}" placeholder="mis. 2">
      </label>
    </div>
    <label>Nama kegiatan
      <input name="activity" maxlength="200" value="${form.activity ?? ''}" required placeholder="mis. Survei harga bahan baku di pasar">
    </label>
    <label>Uraian kegiatan
      <textarea name="description" rows="4" maxlength="5000" placeholder="Apa yang dilakukan, di mana, dengan siapa, bagaimana prosesnya">${form.description ?? ''}</textarea>
    </label>
    <label>Hasil / pembelajaran
      <textarea name="outcome" rows="3" maxlength="5000" placeholder="Temuan, hasil, kendala, dan rencana tindak lanjut">${form.outcome ?? ''}</textarea>
    </label>
    ${withAttendees
      ? html`<label>Anggota yang hadir
          <input name="attendees" maxlength="500" value="${form.attendees ?? ''}" placeholder="Pisahkan dengan koma">
        </label>`
      : ''}`;
}

export function logTable(rows, { showAuthor = false } = {}) {
  if (!rows.length) return html`<p class="muted">Belum ada log.</p>`;
  const sorted = [...rows].sort((a, b) => a.log_date.localeCompare(b.log_date));
  return html`
    <div class="table-wrap">
      <table>
        <thead><tr><th>Tanggal</th><th>Kegiatan</th><th>Hasil</th>${showAuthor ? html`<th>Penulis</th>` : ''}<th class="num">Durasi</th><th>Status</th></tr></thead>
        <tbody>
          ${sorted.map(
            (l) => html`<tr>
              <td class="nowrap">${formatDate(l.log_date)}</td>
              <td><strong>${l.activity}</strong>${l.description ? html`<div class="small clamp">${l.description}</div>` : ''}</td>
              <td class="small">${l.outcome || '-'}</td>
              ${showAuthor ? html`<td class="small">${l.author?.name ?? '-'}</td>` : ''}
              <td class="num nowrap">${formatHours(l.duration_hours)}</td>
              <td>${statusBadge(l.status)}</td>
            </tr>`
          )}
        </tbody>
      </table>
    </div>`;
}

export function documentTable(documents, { showOwner = false, canDelete = null } = {}) {
  if (!documents.length) return html`<p class="muted">Belum ada dokumen.</p>`;
  return html`
    <div class="table-wrap">
      <table>
        <thead><tr><th>Dokumen</th><th>Kategori</th>${showOwner ? html`<th>Pengirim</th>` : ''}<th>Tanggal</th>${canDelete ? html`<th></th>` : ''}</tr></thead>
        <tbody>
          ${documents.map(
            (d) => html`<tr>
              <td>
                ${externalLink(d.url, d.title)} <span class="small muted">↗</span>
                <div class="small muted">${d.scope === 'kelompok' ? 'Kelompok' : 'Pribadi'}${d.description ? html` · ${d.description}` : ''}</div>
              </td>
              <td>${d.category}</td>
              ${showOwner ? html`<td>${d.owner?.name ?? '-'}</td>` : ''}
              <td class="nowrap">${formatDate(d.created_at)}</td>
              ${canDelete
                ? html`<td>${canDelete(d)
                    ? html`<button type="button" class="btn btn-small btn-danger" data-action="delete-document"
                        data-id="${d.id}" data-confirm="Hapus dokumen ini dari daftar?">Hapus</button>`
                    : ''}</td>`
                : ''}
            </tr>`
          )}
        </tbody>
      </table>
    </div>`;
}

export const formErrors = () => html`<div class="form-errors"></div>`;
