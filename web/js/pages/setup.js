import { html } from '../lib/html.js';

export default {
  title: 'Pengaturan awal',
  view: () => html`
    <section class="card narrow-wide">
      <h1>Aplikasi belum terhubung ke database</h1>
      <p>Isi <code>supabaseUrl</code> dan <code>supabaseAnonKey</code> di file <code>web/config.js</code>,
        lalu simpan (commit) ke GitHub. Nilainya ada di Supabase: <em>Project Settings → API</em>.</p>
      <p>Panduan lengkap ada di README repository.</p>
    </section>`,
};
