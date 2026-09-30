import { html } from '../../lib/html.js';
import { todayStr } from '../../lib/period.js';
import { readLog } from '../../lib/validate.js';
import { sb, q, UserError } from '../../api.js';
import { logCard, logFields, formErrors } from '../../components.js';
import { groupLogs, groupInfo } from './data.js';

export default {
  title: 'Log Kelompok',
  async load({ profile, query }) {
    const [group, logs] = await Promise.all([groupInfo(profile), groupLogs(profile)]);
    const editing =
      logs.find((l) => String(l.id) === query.edit && l.author_id === profile.id && l.status !== 'disetujui') ?? null;
    return { group, logs, editing };
  },
  view({ group, logs, editing }, { profile }) {
    if (!group) {
      return html`<div class="page-head"><div><h1>Log Kelompok</h1></div></div>
        <div class="card"><p>Anda belum terdaftar dalam kelompok usaha. Hubungi dosen pengampu agar dimasukkan ke kelompok.</p></div>`;
    }
    const form = editing ?? { log_date: todayStr() };
    return html`
      <div class="page-head"><div>
        <h1>Log Kelompok</h1>
        <p class="muted">Kelompok <strong>${group.name}</strong>${group.business_name ? ` — ${group.business_name}` : ''} ·
          Pembimbing: ${group.mentor?.name ?? 'belum ditentukan'}</p>
        <p class="small muted">Anggota: ${group.members.map((m) => m.name).join(', ')}</p>
      </div></div>
      <div class="layout-split">
        <section class="card" id="form">
          <h2>${editing ? 'Ubah log kelompok' : 'Tambah log kelompok'}</h2>
          <form data-action="save-log">
            ${formErrors()}
            <input type="hidden" name="id" value="${editing?.id ?? ''}">
            ${logFields(form, { withAttendees: true })}
            <div class="actions">
              <button class="btn btn-primary" type="submit">${editing ? 'Simpan perubahan' : 'Simpan log'}</button>
              ${editing ? html`<a class="btn" href="#/mahasiswa/log-kelompok">Batal</a>` : ''}
            </div>
            <p class="small muted">Semua anggota dapat melihat log kelompok; hanya penulis yang dapat mengubah atau menghapusnya.</p>
          </form>
        </section>
        <section>
          <h2>${logs.length} log kelompok</h2>
          ${logs.length ? '' : html`<p class="muted card">Belum ada log kelompok.</p>`}
          ${logs.map((log) =>
            logCard(log, {
              showAuthor: true,
              canEdit: log.author_id === profile.id && log.status !== 'disetujui',
              editHref: `#/mahasiswa/log-kelompok?edit=${log.id}`,
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
    async 'save-log'(values, { profile }) {
      const { row, errors } = readLog(values, { withAttendees: true });
      if (errors.length) throw new UserError(errors);
      if (values.id) {
        const updated = await q(sb.from('group_logs').update(row).eq('id', values.id).eq('author_id', profile.id).select('id'));
        if (!updated.length) throw new UserError('Log hanya dapat diubah oleh penulisnya.');
        return { navigate: '/mahasiswa/log-kelompok', flash: 'Log kelompok diperbarui.' };
      }
      await q(sb.from('group_logs').insert({ ...row, group_id: profile.group_id, author_id: profile.id }));
      return { navigate: '/mahasiswa/log-kelompok', flash: 'Log kelompok tersimpan.' };
    },
    async 'delete-log'({ id }) {
      const deleted = await q(sb.from('group_logs').delete().eq('id', id).select('id'));
      if (!deleted.length) throw new UserError('Log tidak dapat dihapus.');
      return { navigate: '/mahasiswa/log-kelompok', flash: 'Log dihapus.' };
    },
  },
};
