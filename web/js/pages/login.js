import { html } from '../lib/html.js';
import { sb, nimToEmail, UserError, toUserError } from '../api.js';
import { formErrors } from '../components.js';

export default {
  title: 'Masuk',
  view: () => html`
    <section class="login">
      <div class="login-intro">
        <h1>Logbook Kewirausahaan</h1>
        <p>Dokumentasi kegiatan usaha dan ruang belajar untuk mahasiswa dan dosen pembimbing.</p>
      </div>
      <form class="card" data-action="login">
        <h2>Masuk</h2>
        ${formErrors()}
        <label>NIM / NIDN <input name="nim" autocomplete="username" required autofocus></label>
        <label>Kata sandi <input type="password" name="password" autocomplete="current-password" required></label>
        <button class="btn btn-primary btn-block" type="submit">Masuk</button>
        <p class="small muted">Belum punya akun? <a href="#/aktivasi">Aktifkan akun</a> dengan kode aktivasi dari dosen.
          Lupa kata sandi? Hubungi dosen pengampu.</p>
      </form>
    </section>`,
  actions: {
    async login(values, ctx) {
      if (!values.nim.trim() || !values.password) throw new UserError('Isi NIM/NIDN dan kata sandi.');
      const { error } = await sb.auth.signInWithPassword({ email: nimToEmail(values.nim), password: values.password });
      if (error) throw toUserError(error);
      await ctx.reloadProfile();
      return { navigate: '/' };
    },
  },
};
