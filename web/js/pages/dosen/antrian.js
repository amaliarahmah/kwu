import { html } from '../../lib/html.js';
import { sb, fetchAll } from '../../api.js';
import { logCard } from '../../components.js';
import { reviewLog } from './data.js';

export default {
  title: 'Pemeriksaan Log',
  async load() {
    const [personal, group] = await Promise.all([
      fetchAll(() =>
        sb.from('personal_logs')
          .select('*, student:profiles!personal_logs_user_id_fkey(id, nim, name)')
          .eq('status', 'menunggu').order('log_date').order('id')
      ),
      fetchAll(() =>
        sb.from('group_logs')
          .select('*, group:groups(id, name), author:profiles!group_logs_author_id_fkey(name)')
          .eq('status', 'menunggu').order('log_date').order('id')
      ),
    ]);
    return { personal, group };
  },
  view({ personal, group }) {
    return html`
      <div class="page-head"><div>
        <h1>Antrian Pemeriksaan Log</h1>
        <p class="muted">Log berstatus "Menunggu", diurutkan dari yang paling lama.</p>
      </div></div>
      <div class="layout-cols">
        <section>
          <h2>Log pribadi (${personal.length})</h2>
          ${personal.length ? '' : html`<p class="card muted">Tidak ada log pribadi yang menunggu.</p>`}
          ${personal.map((log) =>
            logCard(log, {
              subtitle: html`<a href="#/dosen/mahasiswa/${log.student?.id}">${log.student?.name}</a> (${log.student?.nim})`,
              review: 'review-personal',
            })
          )}
        </section>
        <section>
          <h2>Log kelompok (${group.length})</h2>
          ${group.length ? '' : html`<p class="card muted">Tidak ada log kelompok yang menunggu.</p>`}
          ${group.map((log) =>
            logCard(log, {
              showAuthor: true,
              subtitle: html`<a href="#/dosen/kelompok/${log.group?.id}">${log.group?.name}</a>`,
              review: 'review-group',
            })
          )}
        </section>
      </div>`;
  },
  actions: {
    'review-personal': (values) => reviewLog('personal_logs', values),
    'review-group': (values) => reviewLog('group_logs', values),
  },
};
