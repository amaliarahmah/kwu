import { html } from '../../lib/html.js';
import { sb, q } from '../../api.js';
import { multiline } from '../../components.js';
import { materialsWithProgress } from './data.js';

export default {
  title: 'Topik & Materi',
  async load({ profile }) {
    const [topics, materials] = await Promise.all([
      q(sb.from('topics').select('*').order('week_no', { ascending: true, nullsFirst: false }).order('id')),
      materialsWithProgress(profile),
    ]);
    return {
      topics: topics.map((t) => ({ ...t, materials: materials.filter((m) => m.topic_id === t.id) })),
      done: materials.filter((m) => m.completed_at).length,
      total: materials.length,
    };
  },
  view({ topics, done, total }) {
    return html`
      <div class="page-head">
        <div>
          <h1>Topik &amp; Materi Pembelajaran</h1>
          <p class="muted">Pelajari materi sesuai urutan minggu dan tandai yang sudah selesai.</p>
        </div>
        <div class="progress-box">
          <span class="small muted">${done} dari ${total} materi selesai</span>
          <div class="progress"><span data-width="${total ? Math.round((done / total) * 100) : 0}"></span></div>
        </div>
      </div>
      ${topics.length ? '' : html`<p class="card muted">Dosen belum menambahkan topik pembelajaran.</p>`}
      ${topics.map(
        (t) => html`<section class="card topic">
          <div class="topic-head">
            ${t.week_no ? html`<span class="chip">Minggu ${t.week_no}</span>` : ''}
            <h2>${t.title}</h2>
          </div>
          ${multiline(t.description)}
          ${t.materials.length
            ? html`<ul class="material-list">${t.materials.map(
                (m) => html`<li class="${m.completed_at ? 'done' : ''}">
                  <span class="check" aria-hidden="true">${m.completed_at ? '✓' : ''}</span>
                  <a href="#/mahasiswa/materi/${m.id}">${m.title}</a>
                  <span class="small muted">${[m.attachment_url ? 'lampiran' : null, m.link_url ? 'tautan' : null].filter(Boolean).join(' · ')}</span>
                </li>`
              )}</ul>`
            : html`<p class="small muted">Belum ada materi pada topik ini.</p>`}
        </section>`
      )}`;
  },
};
