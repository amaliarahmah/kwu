import { html } from '../../lib/html.js';
import { todayStr } from '../../lib/period.js';
import { readLog } from '../../lib/validate.js';
import { sb, q, UserError } from '../../api.js';
import { logCard, logFields, formErrors } from '../../components.js';
import { ownLogs } from './data.js';

export default {
  title: 'Log Pribadi',
  async load({ profile, query }) {
    const logs = await ownLogs(profile);
    const editing = logs.find((l) => String(l.id) === query.edit && l.status !== 'disetujui') ?? null;
    return { logs, editing };
  },
  view({ logs, editing }) {
    const form = editing ?? { log_date: todayStr() };
    return html`
      <div class="page-head"><div>
        <h1>Log Pribadi</h1>
        <p class="muted">Catat kegiatan kewirausahaan yang Anda lakukan secara individu.</p>
      </div></div>
      <div class="layout-split">
        <section class="card" id="form">
          <h2>${editing ? 'Ubah log' : 'Tambah log baru'}</h2>
          <form data-action="save-log">
            ${formErrors()}
            <input type="hidden" name="id" value="${editing?.id ?? ''}">
            ${logFields(form)}
            <div class="actions">
              <button class="btn btn-primary" type="submit">${editing ? 'Simpan perubahan' : 'Simpan log'}</button>
              ${editing ? html`<a class="btn" href="#/mahasiswa/log-pribadi">Batal</a>` : ''}
            </div>
            ${editing?.status === 'revisi'
              ? html`<p class="small muted">Setelah disimpan, status log kembali "Menunggu" untuk diperiksa ulang.</p>`
              : ''}
          </form>
        </section>
        <section>
          <h2>${logs.length} log tercatat</h2>
          ${logs.length ? '' : html`<p class="muted card">Belum ada log. Mulai dengan mengisi formulir.</p>`}
          ${logs.map((log) =>
            logCard(log, {
              canEdit: log.status !== 'disetujui',
              editHref: `#/mahasiswa/log-pribadi?edit=${log.id}`,
              deleteAction: 'delete-log',
            })
          )}
        </section>
      </div>`;
  },
  mounted(root, { editing }) {
    if (editing) root.querySelector('#form')?.scrollIntoView();
  },
  actions: {
    async 'save-log'(values) {
      const { row, errors } = readLog(values);
      if (errors.length) throw new UserError(errors);
      if (values.id) {
        await q(sb.from('personal_logs').update(row).eq('id', values.id));
        return { navigate: '/mahasiswa/log-pribadi', flash: 'Log diperbarui dan menunggu pemeriksaan dosen.' };
      }
      await q(sb.from('personal_logs').insert(row));
      return { navigate: '/mahasiswa/log-pribadi', flash: 'Log pribadi tersimpan.' };
    },
    async 'delete-log'({ id }) {
      const deleted = await q(sb.from('personal_logs').delete().eq('id', id).select('id'));
      if (!deleted.length) throw new UserError('Log tidak dapat dihapus (mungkin sudah disetujui dosen).');
      return { navigate: '/mahasiswa/log-pribadi', flash: 'Log dihapus.' };
    },
  },
};
