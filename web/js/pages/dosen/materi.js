import { html } from '../../lib/html.js';
import { readTopic } from '../../lib/validate.js';
import { sb, q, fetchAll, UserError } from '../../api.js';
import { multiline, formErrors } from '../../components.js';
import { topicsQuery, groupBy } from './data.js';

const topicFields = (t = {}) => html`
  <div class="grid-2">
    <label>Judul topik <input name="title" maxlength="200" value="${t.title ?? ''}" required placeholder="mis. Validasi Ide Bisnis"></label>
    <label>Minggu ke- (opsional) <input type="number" name="week_no" min="1" max="52" value="${t.week_no ?? ''}"></label>
  </div>
  <label>Deskripsi / tujuan pembelajaran <textarea name="description" rows="3" maxlength="3000">${t.description ?? ''}</textarea></label>`;

export default {
  title: 'Materi Pembelajaran',
  async load() {
    const [topics, materials, progress, students] = await Promise.all([
      q(topicsQuery()),
      q(sb.from('materials').select('id, topic_id, title, content, link_url, attachment_url').order('id')),
      fetchAll(() => sb.from('material_progress').select('material_id').order('material_id')),
      fetchAll(() => sb.from('profiles').select('id').eq('role', 'mahasiswa').order('id')),
    ]);
    const doneBy = groupBy(progress, 'material_id');
    return {
      studentCount: students.length,
      topics: topics.map((t) => ({
        ...t,
        materials: materials.filter((m) => m.topic_id === t.id).map((m) => ({ ...m, done: doneBy.get(m.id)?.length ?? 0 })),
      })),
    };
  },
  view({ topics, studentCount }) {
    return html`
      <div class="page-head">
        <div>
          <h1>Materi Pembelajaran</h1>
          <p class="muted">Susun topik per minggu, lalu isi materi: teks, tautan video/artikel, atau tautan file (Google Drive, dll.).</p>
        </div>
        <div class="actions"><a class="btn btn-primary" href="#/dosen/materi/baru">+ Tambah materi</a></div>
      </div>

      <details class="card" ${topics.length ? '' : 'open'}>
        <summary><strong>+ Tambah topik</strong></summary>
        <form data-action="add-topic" class="stack">${formErrors()}${topicFields()}
          <button class="btn btn-primary" type="submit">Simpan topik</button>
        </form>
      </details>

      ${topics.map(
        (t) => html`<section class="card topic">
          <div class="topic-head">
            ${t.week_no ? html`<span class="chip">Minggu ${t.week_no}</span>` : ''}
            <h2>${t.title}</h2>
            <a class="btn btn-small" href="#/dosen/materi/baru?topik=${t.id}">+ Materi</a>
          </div>
          ${multiline(t.description)}
          ${t.materials.length
            ? html`<div class="table-wrap"><table>
                <thead><tr><th>Materi</th><th>Isi</th><th class="num">Selesai dipelajari</th><th></th></tr></thead>
                <tbody>${t.materials.map(
                  (m) => html`<tr>
                    <td><strong>${m.title}</strong></td>
                    <td class="small">${[m.content ? 'teks' : null, m.link_url ? 'tautan' : null, m.attachment_url ? 'lampiran' : null].filter(Boolean).join(', ')}</td>
                    <td class="num">${m.done} / ${studentCount}</td>
                    <td class="nowrap"><div class="actions">
                      <a class="btn btn-small" href="#/dosen/materi/${m.id}/ubah">Ubah</a>
                      <button type="button" class="btn btn-small btn-danger" data-action="delete-material" data-id="${m.id}"
                        data-confirm="Hapus materi ini?">Hapus</button>
                    </div></td>
                  </tr>`
                )}</tbody></table></div>`
            : html`<p class="small muted">Belum ada materi.</p>`}
          <details>
            <summary class="small">Ubah / hapus topik</summary>
            <form data-action="update-topic" class="stack">
              ${formErrors()}
              <input type="hidden" name="id" value="${t.id}">
              ${topicFields(t)}
              <button class="btn btn-small btn-primary" type="submit">Simpan</button>
            </form>
            <button type="button" class="btn btn-small btn-danger" data-action="delete-topic" data-id="${t.id}"
              data-confirm="Hapus topik beserta semua materinya?">Hapus topik</button>
          </details>
        </section>`
      )}`;
  },
  actions: {
    async 'add-topic'(values) {
      const { row, errors } = readTopic(values);
      if (errors.length) throw new UserError(errors);
      await q(sb.from('topics').insert(row));
      return { flash: 'Topik ditambahkan.' };
    },
    async 'update-topic'(values) {
      const { row, errors } = readTopic(values);
      if (errors.length) throw new UserError(errors);
      await q(sb.from('topics').update(row).eq('id', values.id));
      return { flash: 'Topik diperbarui.' };
    },
    async 'delete-topic'({ id }) {
      await q(sb.from('topics').delete().eq('id', id));
      return { flash: 'Topik beserta materinya dihapus.' };
    },
    async 'delete-material'({ id }) {
      await q(sb.from('materials').delete().eq('id', id));
      return { flash: 'Materi dihapus.' };
    },
  },
};
