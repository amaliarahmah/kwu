const express = require('express');
const bcrypt = require('bcryptjs');
const { flash } = require('../middleware');
const { str } = require('../validate');

const MAX_ATTEMPTS = 8;
const LOCK_MS = 10 * 60 * 1000;

module.exports = ({ db }) => {
  const router = express.Router();
  const attempts = new Map(); // key: ip|username → { count, lockedUntil }
  const findByUsername = db.prepare('SELECT id, password_hash FROM users WHERE username = ?');
  // Hash tiruan agar waktu respons sama meski username tidak ada.
  const dummyHash = bcrypt.hashSync('dummy-password', 10);

  const homeFor = (user) => (user.role === 'dosen' ? '/dosen' : '/mahasiswa');

  router.get('/', (req, res) => res.redirect(req.user ? homeFor(req.user) : '/login'));

  router.get('/login', (req, res) => {
    if (req.user) return res.redirect(homeFor(req.user));
    res.render('login', { title: 'Masuk', username: '', error: null });
  });

  router.post('/login', async (req, res, next) => {
    const username = str(req.body.username, 50);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const key = `${req.ip}|${username.toLowerCase()}`;
    const entry = attempts.get(key);
    if (entry?.lockedUntil > Date.now()) {
      return res.status(429).render('login', {
        title: 'Masuk',
        username,
        error: 'Terlalu banyak percobaan gagal. Coba lagi dalam 10 menit.',
      });
    }

    const row = username ? findByUsername.get(username) : null;
    const ok = await bcrypt.compare(password, row?.password_hash ?? dummyHash);
    if (!row || !ok) {
      const count = (entry?.count ?? 0) + 1;
      attempts.set(key, { count, lockedUntil: count >= MAX_ATTEMPTS ? Date.now() + LOCK_MS : 0 });
      return res.status(401).render('login', { title: 'Masuk', username, error: 'NIM/NIDN atau kata sandi salah.' });
    }

    attempts.delete(key);
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = row.id;
      res.redirect('/');
    });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('kwu.sid');
      res.redirect('/login');
    });
  });

  router.get('/akun/password', (req, res) => {
    if (!req.user) return res.redirect('/login');
    res.render('password', { title: 'Ubah kata sandi', error: null });
  });

  router.post('/akun/password', async (req, res) => {
    if (!req.user) return res.redirect('/login');
    const { current = '', next: newPassword = '', confirm = '' } = req.body;
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    let error = null;
    if (!(await bcrypt.compare(String(current), row.password_hash))) error = 'Kata sandi lama salah.';
    else if (String(newPassword).length < 8) error = 'Kata sandi baru minimal 8 karakter.';
    else if (newPassword === current) error = 'Kata sandi baru harus berbeda dari kata sandi lama.';
    else if (newPassword !== confirm) error = 'Konfirmasi kata sandi tidak cocok.';
    if (error) return res.status(400).render('password', { title: 'Ubah kata sandi', error });

    const hash = await bcrypt.hash(String(newPassword), 10);
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hash, req.user.id);
    flash(req, 'success', 'Kata sandi berhasil diubah.');
    res.redirect('/');
  });

  return router;
};
