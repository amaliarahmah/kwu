import { html } from '../lib/html.js';
import { sb, q, nimToEmail, UserError, toUserError } from '../api.js';
import { formErrors } from '../components.js';

export default {
  title: 'Aktivasi akun',
  view: () => html`
    <section class="card narrow">
      <h1>Aktivasi akun</h1>
      <p class="muted">Masukkan NIM/NIDN dan kode aktivasi yang diberikan dosen, lalu buat kata sandi Anda sendiri.</p>
      <form data-action="activate">
        ${formErrors()}
        <label>NIM / NIDN <input name="nim" autocomplete="username" required></label>
        <label>Kode aktivasi <input name="code" autocomplete="one-time-code" required maxlength="8" class="mono"></label>
        <label>Kata sandi baru (min. 8 karakter) <input type="password" name="password" minlength="8" autocomplete="new-password" required></label>
        <label>Ulangi kata sandi <input type="password" name="confirm" minlength="8" autocomplete="new-password" required></label>
        <button class="btn btn-primary btn-block" type="submit">Aktifkan akun</button>
        <p class="small muted">Sudah aktif? <a href="#/login">Masuk</a>.</p>
      </form>
    </section>`,
  actions: {
    async activate(values, ctx) {
      const nim = values.nim.trim();
      const code = values.code.trim().toUpperCase();
      if (values.password.length < 8) throw new UserError('Kata sandi minimal 8 karakter.');
      if (values.password !== values.confirm) throw new UserError('Konfirmasi kata sandi tidak cocok.');
      const name = await q(sb.rpc('check_activation', { p_nim: nim, p_code: code }));
      if (!name) throw new UserError('NIM atau kode aktivasi tidak valid, atau akun sudah pernah diaktifkan.');

      const { data, error } = await sb.auth.signUp({
        email: nimToEmail(nim),
        password: values.password,
        options: { data: { nim, activation_code: code } },
      });
      if (error) throw toUserError(error);
      if (!data.session) {
        throw new UserError(
          'Akun dibuat tetapi belum bisa dipakai karena konfirmasi email aktif di Supabase. ' +
            'Minta pengelola menonaktifkan "Confirm email" (lihat README).'
        );
      }
      await ctx.reloadProfile();
      return { navigate: '/', flash: `Selamat datang, ${name}! Akun Anda sudah aktif.` };
    },
  },
};
