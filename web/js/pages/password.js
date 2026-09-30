import { html } from '../lib/html.js';
import { sb, q, nimToEmail, UserError, toUserError } from '../api.js';
import { formErrors } from '../components.js';

export default {
  title: 'Ubah kata sandi',
  view: (data, ctx) => html`
    <section class="card narrow">
      <h1>Ubah kata sandi</h1>
      ${ctx.profile.must_change_password
        ? html`<div class="alert alert-info">Anda masuk dengan kata sandi sementara. Buat kata sandi baru untuk melanjutkan.</div>`
        : ''}
      <form data-action="change-password">
        ${formErrors()}
        <label>Kata sandi saat ini <input type="password" name="current" autocomplete="current-password" required></label>
        <label>Kata sandi baru (min. 8 karakter) <input type="password" name="next" minlength="8" autocomplete="new-password" required></label>
        <label>Ulangi kata sandi baru <input type="password" name="confirm" minlength="8" autocomplete="new-password" required></label>
        <button class="btn btn-primary" type="submit">Simpan</button>
      </form>
    </section>`,
  actions: {
    async 'change-password'(values, ctx) {
      if (values.next.length < 8) throw new UserError('Kata sandi baru minimal 8 karakter.');
      if (values.next !== values.confirm) throw new UserError('Konfirmasi kata sandi tidak cocok.');
      if (values.next === values.current) throw new UserError('Kata sandi baru harus berbeda dari yang lama.');
      // Verifikasi kata sandi lama dengan masuk ulang.
      const check = await sb.auth.signInWithPassword({ email: nimToEmail(ctx.profile.nim), password: values.current });
      if (check.error) throw new UserError('Kata sandi saat ini salah.');
      const { error } = await sb.auth.updateUser({ password: values.next });
      if (error) throw toUserError(error);
      await q(sb.rpc('password_changed'));
      await ctx.reloadProfile();
      return { navigate: '/', flash: 'Kata sandi berhasil diubah.' };
    },
  },
};
