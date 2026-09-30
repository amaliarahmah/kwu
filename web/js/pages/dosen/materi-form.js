import { html } from '../../lib/html.js';
import { readMaterial } from '../../lib/validate.js';
import { sb, q, UserError } from '../../api.js';
import { formErrors } from '../../components.js';
import { topicsQuery } from './data.js';

export default {
  title: 'Materi',
  async load({ params, query }) {
    const topics = await q(topicsQuery());
    if (!topics.length) throw new UserError('Buat topik terlebih dahulu di halaman Materi sebelum menambahkan materi.');
    let material = { topic_id: Number(query.topik) || topics[0].id };
    if (params.id) {
      material = await q(sb.from('materials').select('*').eq('id', params.id).maybeSingle());
      if (!material) throw new UserError('Materi tidak ditemukan.');
    }
    return { title: params.id ? 'Ubah Materi' : 'Tambah Materi', topics, material };
  },
  view({ title, topics, material }) {
    return html`
      <p class="small"><a href="#/dosen/materi">← Materi</a></p>
      <section class="card narrow-wide">
        <h1>${title}</h1>
        <form data-action="save">
          ${formErrors()}
          <input type="hidden" name="id" value="${material.id ?? ''}">
          <div class="grid-2">
            <label>Topik
              <select name="topic_id" required>${topics.map(
                (t) => html`<option value="${t.id}" ${t.id === material.topic_id ? 'selected' : ''}>${t.week_no ? `Minggu ${t.week_no} — ` : ''}${t.title}</option>`
              )}</select>
            </label>
            <label>Judul materi <input name="title" maxlength="200" value="${material.title ?? ''}" required></label>
          </div>
          <label>Isi materi
            <textarea name="content" rows="12" maxlength="50000" placeholder="Ringkasan materi, langkah-langkah, studi kasus, tugas refleksi...">${material.content ?? ''}</textarea>
          </label>
          <label>Tautan video/artikel (opsional)
            <input type="url" name="link_url" value="${material.link_url ?? ''}" placeholder="https://www.youtube.com/...">
          </label>
          <label>Tautan file lampiran (opsional)
            <input type="url" name="attachment_url" value="${material.attachment_url ?? ''}" placeholder="https://drive.google.com/... (slide, modul PDF)">
          </label>
          <p class="small muted">Untuk lampiran di Google Drive, atur akses "Siapa saja yang memiliki link dapat melihat".</p>
          <div class="actions">
            <button class="btn btn-primary" type="submit">Simpan materi</button>
            <a class="btn" href="#/dosen/materi">Batal</a>
          </div>
        </form>
      </section>`;
  },
  actions: {
    async save(values) {
      const { row, errors } = readMaterial(values);
      if (errors.length) throw new UserError(errors);
      if (values.id) await q(sb.from('materials').update(row).eq('id', values.id));
      else await q(sb.from('materials').insert(row));
      return { navigate: '/dosen/materi', flash: values.id ? 'Materi diperbarui.' : 'Materi ditambahkan.' };
    },
  },
};
