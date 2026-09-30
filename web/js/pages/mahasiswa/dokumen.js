import { html } from '../../lib/html.js';
import { readDocument } from '../../lib/validate.js';
import { sb, q, UserError } from '../../api.js';
import { documentTable, formErrors } from '../../components.js';
import { DOCUMENT_CATEGORIES } from '../../constants.js';
import { visibleDocuments } from './data.js';

export default {
  title: 'Dokumen',
  async load() {
    return { documents: await visibleDocuments() };
  },
  view({ documents }, { profile }) {
    return html`
      <div class="page-head"><div>
        <h1>Dokumen</h1>
        <p class="muted">Kirim tautan dokumen (Google Drive, OneDrive, Dropbox, dll.): proposal, laporan, bukti kegiatan, dan lainnya.</p>
      </div></div>
      <div class="layout-split">
        <section class="card">
          <h2>Tambah dokumen</h2>
          <form data-action="add-document">
            ${formErrors()}
            <label>Judul <input name="title" maxlength="200" required placeholder="mis. Proposal Usaha Keripik Singkong"></label>
            <div class="grid-2">
              <label>Kategori
                <select name="category" required>${DOCUMENT_CATEGORIES.map((c) => html`<option>${c}</option>`)}</select>
              </label>
              <label>Milik
                <select name="scope">
                  <option value="pribadi">Pribadi</option>
                  <option value="kelompok" ${profile.group_id ? '' : 'disabled'}>Kelompok</option>
                </select>
              </label>
            </div>
            <label>Tautan dokumen <input type="url" name="url" required placeholder="https://drive.google.com/..."></label>
            <div class="alert alert-info small">
              Pastikan akses tautan diatur <strong>"Siapa saja yang memiliki link dapat melihat"</strong>
              agar dosen bisa membukanya. Jangan menghapus atau memindahkan file setelah dikirim.
            </div>
            <label>Keterangan (opsional) <textarea name="description" rows="2" maxlength="2000"></textarea></label>
            <button class="btn btn-primary" type="submit">Simpan</button>
          </form>
        </section>
        <section>
          <h2>${documents.length} dokumen</h2>
          <div class="card flush">${documentTable(documents, { showOwner: true, canDelete: (d) => d.owner_id === profile.id })}</div>
        </section>
      </div>`;
  },
  actions: {
    async 'add-document'(values, { profile }) {
      const { row, errors } = readDocument(values, { categories: DOCUMENT_CATEGORIES, hasGroup: Boolean(profile.group_id) });
      if (errors.length) throw new UserError(errors);
      await q(sb.from('documents').insert({ ...row, owner_id: profile.id, group_id: row.scope === 'kelompok' ? profile.group_id : null }));
      return { navigate: '/mahasiswa/dokumen', flash: 'Dokumen tersimpan.' };
    },
    async 'delete-document'({ id }) {
      const deleted = await q(sb.from('documents').delete().eq('id', id).select('id'));
      if (!deleted.length) throw new UserError('Dokumen hanya dapat dihapus oleh pengirimnya.');
      return { navigate: '/mahasiswa/dokumen', flash: 'Dokumen dihapus dari daftar.' };
    },
  },
};
