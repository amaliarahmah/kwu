import { html } from '../../lib/html.js';
import { formatDate } from '../../lib/format.js';
import { sb, q, UserError } from '../../api.js';
import { multiline } from '../../components.js';

export default {
  title: 'Materi',
  async load({ params, profile }) {
    const material = await q(sb.from('materials').select('*, topic:topics(title, week_no)').eq('id', params.id).maybeSingle());
    if (!material) throw new UserError('Materi tidak ditemukan.');
    const progress = await q(
      sb.from('material_progress').select('completed_at').eq('user_id', profile.id).eq('material_id', material.id).maybeSingle()
    );
    return { title: material.title, material, completedAt: progress?.completed_at ?? null };
  },
  view({ material, completedAt }) {
    return html`
      <p class="small"><a href="#/mahasiswa/materi">← Semua materi</a></p>
      <article class="card material">
        <p class="muted small">${material.topic?.week_no ? `Minggu ${material.topic.week_no} · ` : ''}${material.topic?.title}</p>
        <h1>${material.title}</h1>
        ${multiline(material.content)}
        <div class="actions">
          ${material.link_url ? html`<a class="btn" href="${material.link_url}" target="_blank" rel="noopener noreferrer">Buka tautan materi ↗</a>` : ''}
          ${material.attachment_url ? html`<a class="btn" href="${material.attachment_url}" target="_blank" rel="noopener noreferrer">Buka lampiran ↗</a>` : ''}
        </div>
        <div class="done-form">
          ${completedAt
            ? html`<span class="badge level-baik">Selesai dipelajari ${formatDate(completedAt)}</span>
                <button type="button" class="btn btn-small" data-action="toggle" data-id="${material.id}" data-done="0">Tandai belum selesai</button>`
            : html`<button type="button" class="btn btn-primary" data-action="toggle" data-id="${material.id}" data-done="1">Tandai sudah dipelajari</button>`}
        </div>
      </article>`;
  },
  actions: {
    async toggle({ id, done }, { profile }) {
      if (done === '1') await q(sb.from('material_progress').upsert({ user_id: profile.id, material_id: Number(id) }, { ignoreDuplicates: true }));
      else await q(sb.from('material_progress').delete().eq('user_id', profile.id).eq('material_id', id));
    },
  },
};
